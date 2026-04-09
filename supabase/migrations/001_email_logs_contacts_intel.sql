-- ============================================================
-- Migration 001: email_logs + buyer_contacts + company_intel
-- Run this in your Supabase SQL editor:
--   Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Add company_intel JSONB column to buyers table
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS company_intel JSONB;

-- 2. Create email_logs table
CREATE TABLE IF NOT EXISTS email_logs (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  buyer_id    uuid REFERENCES buyers(id) ON DELETE SET NULL,
  to_email    text NOT NULL DEFAULT '',
  to_name     text DEFAULT '',
  company     text DEFAULT '',
  region      text DEFAULT '',
  subject     text DEFAULT '',
  body        text DEFAULT '',
  status      text DEFAULT '발송완료',  -- 발송완료 | 회신받음 | 반송됨
  sent_at     timestamptz DEFAULT now(),
  opened_at   timestamptz,
  replied_at  timestamptz,
  bounced_at  timestamptz
);

ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all email_logs" ON email_logs;
CREATE POLICY "Allow all email_logs" ON email_logs FOR ALL USING (true) WITH CHECK (true);

-- 3. Create buyer_contacts table (multiple contacts per company)
CREATE TABLE IF NOT EXISTS buyer_contacts (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  buyer_id        uuid REFERENCES buyers(id) ON DELETE CASCADE,
  contact_name    text DEFAULT '',
  contact_title   text DEFAULT '',
  contact_email   text DEFAULT '',
  contact_linkedin text DEFAULT '',
  is_primary      boolean DEFAULT false,
  source          text DEFAULT 'manual',  -- manual | clay | linkedin
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE buyer_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all buyer_contacts" ON buyer_contacts;
CREATE POLICY "Allow all buyer_contacts" ON buyer_contacts FOR ALL USING (true) WITH CHECK (true);

-- 4. Migrate existing primary contacts to buyer_contacts
INSERT INTO buyer_contacts (buyer_id, contact_name, contact_title, contact_email, is_primary, source)
SELECT id, contact_name, contact_title, contact_email, true, 'clay'
FROM buyers
WHERE contact_name IS NOT NULL AND contact_name != ''
ON CONFLICT DO NOTHING;
