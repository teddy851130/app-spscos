-- ============================================
-- 마이그레이션 011: 클릭 추적 + Pipedrive 연동 (PR13)
-- ============================================
-- 배경:
--   PR10/PR11에서 모든 첫 메일 P.S.에 https://spscos.com/ 하드코딩 삽입 중.
--   클릭한 바이어 = 관심 리드 신호 → 현재는 수집 불가.
--
-- PR13 목표:
--   1) 자체 redirect 엔드포인트 (/go/[token]) 로 클릭 수집
--   2) click_events 테이블 + buyer_contacts.contact_status='Interested' 자동 갱신
--   3) 대시보드 "오늘의 관심 리드" 위젯 (옵션 B)
--   4) Pipedrive "Website visited" Activity 자동 등록 (옵션 C)
--
-- 설계 결정:
--   - 토큰 방식: buyer_contacts.tracking_token (12자 hex, UNIQUE, DB 생성)
--     → HMAC secret env 불필요. URL 짧고 검증 = 단순 lookup.
--     → 충돌 공간 2^48 ≈ 281조 → 수십억 레코드까지 안전.
--   - contact_status 기존 CHECK에 'Interested' 이미 포함 → enum 수정 불필요.
--   - 자동 상태 갱신은 route.ts 코드에서 직접 UPDATE (trigger 아님) — 테스트 용이.
--   - click_events RLS: SELECT true (대시보드 anon 쿼리), INSERT/UPDATE는 service_role bypass.
--
-- 롤백: 011_click_tracking_rollback.sql 참조

BEGIN;

-- ============================================
-- 1. buyer_contacts.tracking_token
-- ============================================
-- volatile default를 쓰면 ADD COLUMN DEFAULT 시 단일 값으로 backfill되어 UNIQUE 위배.
-- → 3단계로 분리 (ADD NULL → UPDATE per-row → SET NOT NULL + DEFAULT + UNIQUE).

ALTER TABLE buyer_contacts
  ADD COLUMN IF NOT EXISTS tracking_token TEXT;

UPDATE buyer_contacts
  SET tracking_token = encode(gen_random_bytes(6), 'hex')
  WHERE tracking_token IS NULL;

ALTER TABLE buyer_contacts
  ALTER COLUMN tracking_token SET NOT NULL,
  ALTER COLUMN tracking_token SET DEFAULT encode(gen_random_bytes(6), 'hex');

CREATE UNIQUE INDEX IF NOT EXISTS buyer_contacts_tracking_token_key
  ON buyer_contacts(tracking_token);

-- ============================================
-- 2. click_events 테이블
-- ============================================
CREATE TABLE IF NOT EXISTS click_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_contact_id UUID NOT NULL REFERENCES buyer_contacts(id) ON DELETE CASCADE,
  tracking_token TEXT NOT NULL,
  clicked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_agent TEXT,
  ip_address TEXT,
  ip_country TEXT,
  referer TEXT,
  pipedrive_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (pipedrive_status IN ('pending', 'success', 'failed', 'skipped')),
  pipedrive_activity_id BIGINT,
  pipedrive_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_click_events_contact
  ON click_events(buyer_contact_id, clicked_at DESC);
CREATE INDEX IF NOT EXISTS idx_click_events_clicked_at
  ON click_events(clicked_at DESC);

-- ============================================
-- 3. RLS
-- ============================================
ALTER TABLE click_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read click_events" ON click_events;
CREATE POLICY "read click_events"
  ON click_events FOR SELECT
  USING (true);

-- INSERT/UPDATE 정책 없음 → anon/authenticated는 막힘. service_role은 RLS bypass.
-- route.ts가 SERVICE_ROLE_KEY로 INSERT/UPDATE.

-- ============================================
-- 4. PostgREST 스키마 리로드
-- ============================================
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================
-- 검증 (Dashboard SQL Editor에서 수동 실행)
-- ============================================
-- 1) tracking_token 컬럼 존재 확인
--    SELECT column_name, data_type, is_nullable, column_default
--    FROM information_schema.columns
--    WHERE table_name='buyer_contacts' AND column_name='tracking_token';
--    → text / NO / encode(gen_random_bytes(6), 'hex')
--
-- 2) 모든 기존 contact 토큰 backfill 완료
--    SELECT count(*) FROM buyer_contacts WHERE tracking_token IS NULL;
--    → 0
--
-- 3) UNIQUE 위배 확인
--    SELECT tracking_token, count(*) FROM buyer_contacts
--    GROUP BY tracking_token HAVING count(*) > 1;
--    → 빈 결과
--
-- 4) click_events 테이블 확인
--    SELECT count(*) FROM click_events;
--    → 0 (초기 상태)
--
-- 5) RLS 정책 확인
--    SELECT policyname, cmd FROM pg_policies WHERE tablename='click_events';
--    → read click_events / SELECT
