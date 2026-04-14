-- ============================================
-- 마이그레이션 007: RLS 최소 보호 (인증 사용자만 쓰기)
-- 실행 위치: Supabase Dashboard → SQL Editor
-- 날짜: 2026-04-14
--
-- 배경: 기존에 모든 테이블이 anon에게 완전 개방되어 있었음.
--   Google Auth 도입 후, 인증된 사용자(authenticated)만 쓰기 허용.
--   읽기(SELECT)는 기존대로 모두 허용 유지.
--
-- ⚠️ 주의: 이 마이그레이션 실행 전에 Supabase Dashboard에서
--   Google OAuth provider를 먼저 활성화해야 합니다.
-- ============================================

-- ============================================
-- 1. 기존 쓰기 정책 삭제
-- ============================================

-- buyers
DROP POLICY IF EXISTS "Allow insert buyers" ON buyers;
DROP POLICY IF EXISTS "Allow update buyers" ON buyers;
DROP POLICY IF EXISTS "anon can insert buyers" ON buyers;
DROP POLICY IF EXISTS "anon can update buyers" ON buyers;

-- email_logs
DROP POLICY IF EXISTS "Allow insert email_logs" ON email_logs;
DROP POLICY IF EXISTS "Allow update email_logs" ON email_logs;
DROP POLICY IF EXISTS "Allow all email_logs" ON email_logs;

-- buyer_contacts
DROP POLICY IF EXISTS "Allow all buyer_contacts" ON buyer_contacts;
DROP POLICY IF EXISTS "Allow insert buyer_contacts" ON buyer_contacts;
DROP POLICY IF EXISTS "Allow update buyer_contacts" ON buyer_contacts;

-- pipeline_jobs
DROP POLICY IF EXISTS "Allow insert pipeline_jobs" ON pipeline_jobs;
DROP POLICY IF EXISTS "Allow update pipeline_jobs" ON pipeline_jobs;

-- email_drafts
DROP POLICY IF EXISTS "Allow insert email_drafts" ON email_drafts;
DROP POLICY IF EXISTS "Allow update email_drafts" ON email_drafts;

-- pipeline_logs
DROP POLICY IF EXISTS "Allow insert pipeline_logs" ON pipeline_logs;

-- kpi_snapshots
DROP POLICY IF EXISTS "Allow insert kpi_snapshots" ON kpi_snapshots;
DROP POLICY IF EXISTS "Allow update kpi_snapshots" ON kpi_snapshots;

-- ============================================
-- 2. 인증 사용자만 쓰기 허용 정책 생성
-- auth.role() = 'authenticated' → Google 로그인 완료한 사용자
-- service_role은 RLS를 우회하므로 Edge Function에는 영향 없음
-- ============================================

-- buyers (프론트에서 INSERT/UPDATE 사용)
CREATE POLICY "authenticated can insert buyers"
  ON buyers FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "authenticated can update buyers"
  ON buyers FOR UPDATE
  USING (auth.role() = 'authenticated');

-- email_logs (Edge Function이 service_role로 INSERT하므로 프론트 불필요하지만, 안전하게 허용)
CREATE POLICY "authenticated can insert email_logs"
  ON email_logs FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "authenticated can update email_logs"
  ON email_logs FOR UPDATE
  USING (auth.role() = 'authenticated');

-- buyer_contacts
CREATE POLICY "authenticated can insert buyer_contacts"
  ON buyer_contacts FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "authenticated can update buyer_contacts"
  ON buyer_contacts FOR UPDATE
  USING (auth.role() = 'authenticated');

-- pipeline_jobs
CREATE POLICY "authenticated can insert pipeline_jobs"
  ON pipeline_jobs FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "authenticated can update pipeline_jobs"
  ON pipeline_jobs FOR UPDATE
  USING (auth.role() = 'authenticated');

-- email_drafts
CREATE POLICY "authenticated can insert email_drafts"
  ON email_drafts FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "authenticated can update email_drafts"
  ON email_drafts FOR UPDATE
  USING (auth.role() = 'authenticated');

-- pipeline_logs
CREATE POLICY "authenticated can insert pipeline_logs"
  ON pipeline_logs FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- kpi_snapshots (snapshot-kpi Edge Function이 service_role로 UPSERT)
CREATE POLICY "authenticated can insert kpi_snapshots"
  ON kpi_snapshots FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "authenticated can update kpi_snapshots"
  ON kpi_snapshots FOR UPDATE
  USING (auth.role() = 'authenticated');

-- ============================================
-- 3. 읽기(SELECT) 정책은 기존 유지 (변경 없음)
-- 모든 테이블의 SELECT 정책은 USING(true)로 이미 설정됨
-- ============================================
