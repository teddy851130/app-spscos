-- ============================================
-- Migration 003: email_status 체크 제약조건 업데이트
-- catch-all-pass / catch-all-fail 추가
-- ============================================

ALTER TABLE buyer_contacts DROP CONSTRAINT IF EXISTS buyer_contacts_email_status_check;
ALTER TABLE buyer_contacts ADD CONSTRAINT buyer_contacts_email_status_check
  CHECK (email_status IN ('valid', 'invalid', 'catch-all', 'catch-all-pass', 'catch-all-fail', 'risky', 'unknown'));
