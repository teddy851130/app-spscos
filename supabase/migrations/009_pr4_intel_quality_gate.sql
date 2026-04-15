-- ============================================
-- 마이그레이션 009: PR4 인텔 품질 게이트
-- ============================================
-- 목적:
--   1. buyers.analysis_failed_at 추가 — 직원 C의 JSON 파싱 실패·품질 미달을 기록하여
--      동일 바이어를 무한 재분석하지 않도록 차단
--   2. buyers.intel_score 추가 — 인텔 품질 점수(0~100, NULL=미분석) 저장
--   3. buyers.status CHECK에 'intel_failed' 추가 — 품질 재시도 후에도 실패한 바이어 마킹
--      → 직원 D·이메일 발송 경로에서 자동 제외
--
-- 롤백: 009_pr4_intel_quality_gate_rollback.sql

BEGIN;

-- ============================================
-- 1. buyers에 컬럼 2개 추가
-- ============================================
-- analysis_failed_at: 직원 C가 분석을 포기한 시점. NULL이면 아직 실패하지 않음.
--   재분석 시 NULL로 리셋(대표님 직접 실행 시에만) — 기본적으로 자동 리셋 없음.
ALTER TABLE buyers
  ADD COLUMN IF NOT EXISTS analysis_failed_at TIMESTAMPTZ;

-- intel_score: 직원 C가 생성한 recent_news의 품질 점수(0~100).
--   company_status / kbeauty_interest / recommended_formula / proposal_angle
--   4개 필드의 길이/내용을 기반으로 계산. NULL이면 미측정.
ALTER TABLE buyers
  ADD COLUMN IF NOT EXISTS intel_score INTEGER
  CHECK (intel_score IS NULL OR (intel_score >= 0 AND intel_score <= 100));

CREATE INDEX IF NOT EXISTS idx_buyers_analysis_failed_at ON buyers(analysis_failed_at);

-- ============================================
-- 2. buyers.status CHECK 제약에 'intel_failed' 추가
-- ============================================
-- 기존 CHECK (status IN ('Cold', 'Contacted', 'Replied', 'Bounced', 'Interested', 'Sample', 'Deal', 'Lost'))
-- → 'intel_failed' 추가. DROP + ADD 패턴 (CHECK 제약은 수정 불가).

ALTER TABLE buyers DROP CONSTRAINT IF EXISTS buyers_status_check;
ALTER TABLE buyers ADD CONSTRAINT buyers_status_check
  CHECK (status IN (
    'Cold', 'Contacted', 'Replied', 'Bounced',
    'Interested', 'Sample', 'Deal', 'Lost',
    'intel_failed'
  ));

COMMIT;

-- ============================================
-- 검증 (수동 실행 권장)
-- ============================================
-- 1) 신규 컬럼 확인
--    SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name='buyers' AND column_name IN ('analysis_failed_at','intel_score');
--
-- 2) CHECK 제약 확인
--    SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname='buyers_status_check';
--
-- 3) intel_failed 상태 INSERT 테스트 (개발 환경에서만)
--    INSERT INTO buyers (company_name, region, tier, status) VALUES ('_test', 'GCC', 'Tier2', 'intel_failed');
--    DELETE FROM buyers WHERE company_name='_test';
