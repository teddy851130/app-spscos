-- ============================================
-- 마이그레이션 008 롤백
-- ============================================
-- 008_pr1_data_integrity.sql의 변경을 원복.
-- 문제 발생 시 즉시 이 SQL을 Supabase SQL Editor에서 실행.

BEGIN;

-- 1. RPC 제거
DROP FUNCTION IF EXISTS increment_email_sent(UUID, TIMESTAMPTZ, TIMESTAMPTZ);

-- 2. UNIQUE 인덱스 제거
DROP INDEX IF EXISTS uniq_email_drafts_unsent_contact;

-- 3. email_drafts.buyer_id 컬럼 제거
DROP INDEX IF EXISTS idx_email_drafts_buyer_id;
ALTER TABLE email_drafts DROP COLUMN IF EXISTS buyer_id;

COMMIT;

-- ============================================
-- 주의사항
-- ============================================
-- UNIQUE 제약을 건 뒤 DELETE로 중복 초안을 정리했으므로,
-- 롤백해도 삭제된 중복 row는 복구되지 않습니다.
-- 실제 운영 중 롤백이 필요하면 사전에 email_drafts 테이블 백업:
--   CREATE TABLE email_drafts_backup_pr1 AS SELECT * FROM email_drafts;
