-- ============================================
-- 마이그레이션 008: PR1 데이터 무결성
-- ============================================
-- 목적:
--   1. email_drafts.buyer_id 컬럼 추가 (MailQueue "회사 미상" 버그 해결)
--   2. 미발송 초안 UNIQUE 제약 (동일 컨택트 초안 중복 INSERT 방지)
--   3. email_count 원자적 증가 RPC (동시 발송 race condition 해결)
--
-- 주의:
--   - 스팸 점수 스케일은 이미 "10=안전, 1=위험"으로 DB에 올바르게 저장되어 있음.
--     따라서 값 변환 migration 불필요. (MailQueue 표시 코드만 수정 예정)
--
-- 롤백: 008_pr1_data_integrity_rollback.sql 참조
--
-- ============================================
-- ⚠️ 실행 전 사전 점검 (수동으로 SQL Editor에서 먼저 확인)
-- ============================================
-- 1. 스팸 스케일 분포 확인 — 1~10 범위인지, 이상치 없는지
--    SELECT
--      MIN(spam_score) AS min_s, MAX(spam_score) AS max_s,
--      AVG(spam_score)::numeric(5,2) AS avg_s, COUNT(*) FILTER (WHERE spam_score IS NOT NULL) AS scored
--    FROM email_drafts;
--    → min >= 1, max <= 10 이어야 함. 벗어나면 스케일이 혼재된 것이므로 이 migration 중단 후 별도 처리 필요.
--
-- 2. 고아 email_drafts (backfill 실패 예상치) 확인
--    SELECT COUNT(*) AS orphan_drafts
--    FROM email_drafts ed
--    LEFT JOIN buyer_contacts bc ON ed.buyer_contact_id = bc.id
--    WHERE bc.id IS NULL OR bc.buyer_id IS NULL;
--    → 0 이 아니면 backfill 후 NOT NULL 전환에서 실패. 고아 row를 먼저 처리해야 함:
--      옵션 A) DELETE FROM email_drafts WHERE id IN (…);
--      옵션 B) 더미 buyer에 연결
--    어느 쪽이든 대표님 확인 필수.
--
-- 3. 미발송 초안 중복 건수 확인 (UNIQUE 적용 전에 얼마나 삭제되는지 파악)
--    SELECT buyer_contact_id, COUNT(*) AS cnt
--    FROM email_drafts WHERE is_sent = FALSE
--    GROUP BY buyer_contact_id HAVING COUNT(*) > 1;

BEGIN;

-- ============================================
-- 1. email_drafts.buyer_id 컬럼 추가
-- ============================================
-- 기존에는 buyer_contact_id만 있어서 MailQueue가 3단계 조인
-- (email_drafts → buyer_contacts → buyers.company_name). 중간이 끊기면 "회사 미상".
-- buyer_id를 직접 저장하면 1단계 조인으로 해결.

ALTER TABLE email_drafts
  ADD COLUMN IF NOT EXISTS buyer_id UUID REFERENCES buyers(id) ON DELETE CASCADE;

-- 기존 row에 대해 buyer_contacts를 통해 buyer_id backfill
UPDATE email_drafts ed
SET buyer_id = bc.buyer_id
FROM buyer_contacts bc
WHERE ed.buyer_contact_id = bc.id
  AND ed.buyer_id IS NULL;

-- backfill 후 NOT NULL 강제 (고아 row가 있으면 이 단계에서 실패 → 트랜잭션 롤백)
-- 실패 시 고아 row 확인: SELECT id, buyer_contact_id FROM email_drafts WHERE buyer_id IS NULL;
ALTER TABLE email_drafts
  ALTER COLUMN buyer_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_drafts_buyer_id ON email_drafts(buyer_id);

-- ============================================
-- 2. 미발송 초안 UNIQUE 제약
-- ============================================
-- 현재 직원 D는 "이미 초안이 있는 contact 제외" 로직이 있지만
-- generate-draft Edge Function 수동 호출이나 동시 실행에서는 중복 생성 가능.
-- DB 차원에서 is_sent=false 초안은 컨택트당 1개만 허용하도록 부분 UNIQUE.

-- 기존 중복 cleanup: 동일 컨택트의 미발송 초안 중 최신 1건만 유지
DELETE FROM email_drafts
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY buyer_contact_id
        ORDER BY created_at DESC
      ) AS rn
    FROM email_drafts
    WHERE is_sent = FALSE
  ) ranked
  WHERE rn > 1
);

-- 부분 UNIQUE 인덱스: 미발송(is_sent=false)만 대상
CREATE UNIQUE INDEX IF NOT EXISTS uniq_email_drafts_unsent_contact
  ON email_drafts(buyer_contact_id)
  WHERE is_sent = FALSE;

-- ============================================
-- 3. email_count 원자적 증가 RPC
-- ============================================
-- send-email 함수가 SELECT → UPDATE 2단계로 카운트를 증가시키고 있어
-- 동시 발송 시 값이 누락될 수 있음 (race condition).
-- PostgreSQL function으로 원자적 증감 + 부수 필드 동시 업데이트.

CREATE OR REPLACE FUNCTION increment_email_sent(
  p_buyer_id UUID,
  p_sent_at TIMESTAMPTZ,
  p_next_followup_at TIMESTAMPTZ
) RETURNS TABLE (
  new_email_count INTEGER,
  new_status TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  RETURN QUERY
  UPDATE buyers
  SET
    email_count = COALESCE(email_count, 0) + 1,
    last_sent_at = p_sent_at,
    next_followup_at = p_next_followup_at,
    -- Cold 상태만 Contacted로 변경. 이미 Contacted/Replied 등은 유지
    status = CASE WHEN status = 'Cold' THEN 'Contacted' ELSE status END,
    updated_at = NOW()
  WHERE id = p_buyer_id
  RETURNING email_count, status;

  -- 존재하지 않는 buyer_id 조용히 통과 방지 — send-email이 잘못된 id를 보내면 즉시 알림
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'buyer not found: %', p_buyer_id
      USING ERRCODE = 'P0002'; -- no_data_found
  END IF;
END;
$$;

-- 서비스 롤에서만 호출 (anon key로 카운트 조작 방지)
REVOKE ALL ON FUNCTION increment_email_sent(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_email_sent(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

COMMIT;

-- ============================================
-- 검증 쿼리 (migration 후 수동 실행)
-- ============================================
-- 1) buyer_id backfill 확인
--    SELECT COUNT(*) AS null_buyer_id FROM email_drafts WHERE buyer_id IS NULL;
--    → 0 이어야 함
--
-- 2) UNIQUE 제약 동작 확인 (강제로 중복 INSERT 시도 → 실패해야 함)
--    예: 테스트 환경에서만
--
-- 3) RPC 호출 확인
--    SELECT * FROM increment_email_sent(
--      '<existing_buyer_uuid>'::uuid,
--      NOW(),
--      NOW() + INTERVAL '7 days'
--    );
