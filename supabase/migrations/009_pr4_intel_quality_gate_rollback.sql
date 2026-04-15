-- ============================================
-- 마이그레이션 009 롤백
-- ============================================
-- 009_pr4_intel_quality_gate.sql 원복.

BEGIN;

-- 1. status CHECK 제약 복원 (Bounced까지만 허용, intel_failed 제거)
--    주의: 롤백 전 'intel_failed' 상태인 row가 있으면 CHECK 제약 위반으로 실패.
--    그런 row를 먼저 정리해야 함:
--      UPDATE buyers SET status='Cold', analysis_failed_at=NULL WHERE status='intel_failed';

ALTER TABLE buyers DROP CONSTRAINT IF EXISTS buyers_status_check;
ALTER TABLE buyers ADD CONSTRAINT buyers_status_check
  CHECK (status IN (
    'Cold', 'Contacted', 'Replied', 'Bounced',
    'Interested', 'Sample', 'Deal', 'Lost'
  ));

-- 2. 신규 컬럼 제거
DROP INDEX IF EXISTS idx_buyers_analysis_failed_at;
ALTER TABLE buyers DROP COLUMN IF EXISTS intel_score;
ALTER TABLE buyers DROP COLUMN IF EXISTS analysis_failed_at;

COMMIT;
