-- ============================================
-- Migration 003: 제약조건 업데이트
-- ============================================

-- buyer_contacts: catch-all-pass / catch-all-fail 추가
ALTER TABLE buyer_contacts DROP CONSTRAINT IF EXISTS buyer_contacts_email_status_check;
ALTER TABLE buyer_contacts ADD CONSTRAINT buyer_contacts_email_status_check
  CHECK (email_status IN ('valid', 'invalid', 'catch-all', 'catch-all-pass', 'catch-all-fail', 'risky', 'unknown'));

-- email_drafts: pending_intel 상태 추가
ALTER TABLE email_drafts DROP CONSTRAINT IF EXISTS email_drafts_spam_status_check;
ALTER TABLE email_drafts ADD CONSTRAINT email_drafts_spam_status_check
  CHECK (spam_status IN ('pass', 'flag', 'rewrite', 'pending_intel'));
