-- PR14: email_drafts.spam_reason — flag 사유 UI 노출 (ADR-033 예정)
-- agentE가 기존에 pipeline_logs에만 남기던 Claude flag 이유를 email_drafts 자체 컬럼에 저장 → MailQueue/Dashboard 카드에서 직관적으로 확인.

ALTER TABLE email_drafts
  ADD COLUMN IF NOT EXISTS spam_reason TEXT;

-- PostgREST 캐시 갱신 — supabase-js에서 즉시 컬럼 인식
NOTIFY pgrst, 'reload schema';
