-- PR14 rollback
ALTER TABLE email_drafts DROP COLUMN IF EXISTS spam_reason;
NOTIFY pgrst, 'reload schema';
