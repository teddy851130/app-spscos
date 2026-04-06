-- ============================================
-- SPS 정책 재설정 + 샘플 데이터 삽입
-- (테이블은 이미 생성됨 — 정책만 재설정)
-- ============================================

-- 기존 정책 삭제
DROP POLICY IF EXISTS "anon can read buyers" ON buyers;
DROP POLICY IF EXISTS "anon can insert buyers" ON buyers;
DROP POLICY IF EXISTS "anon can update buyers" ON buyers;
DROP POLICY IF EXISTS "anon can read email_logs" ON email_logs;
DROP POLICY IF EXISTS "anon can insert email_logs" ON email_logs;
DROP POLICY IF EXISTS "anon can update email_logs" ON email_logs;
DROP POLICY IF EXISTS "anon can read pipeline_runs" ON pipeline_runs;
DROP POLICY IF EXISTS "anon can insert pipeline_runs" ON pipeline_runs;
DROP POLICY IF EXISTS "anon can read kpi_snapshots" ON kpi_snapshots;
DROP POLICY IF EXISTS "anon can insert kpi_snapshots" ON kpi_snapshots;
DROP POLICY IF EXISTS "anon can update kpi_snapshots" ON kpi_snapshots;

-- 정책 재생성
CREATE POLICY "anon can read buyers" ON buyers FOR SELECT USING (true);
CREATE POLICY "anon can insert buyers" ON buyers FOR INSERT WITH CHECK (true);
CREATE POLICY "anon can update buyers" ON buyers FOR UPDATE USING (true);
CREATE POLICY "anon can read email_logs" ON email_logs FOR SELECT USING (true);
CREATE POLICY "anon can insert email_logs" ON email_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "anon can update email_logs" ON email_logs FOR UPDATE USING (true);
CREATE POLICY "anon can read pipeline_runs" ON pipeline_runs FOR SELECT USING (true);
CREATE POLICY "anon can insert pipeline_runs" ON pipeline_runs FOR INSERT WITH CHECK (true);
CREATE POLICY "anon can read kpi_snapshots" ON kpi_snapshots FOR SELECT USING (true);
CREATE POLICY "anon can insert kpi_snapshots" ON kpi_snapshots FOR INSERT WITH CHECK (true);
CREATE POLICY "anon can update kpi_snapshots" ON kpi_snapshots FOR UPDATE USING (true);

-- 기존 샘플 데이터 삭제 후 재삽입
DELETE FROM kpi_snapshots;
DELETE FROM email_logs;
DELETE FROM buyers;

-- 바이어 샘플 데이터
INSERT INTO buyers (company_name, website, region, tier, contact_name, contact_title, contact_email, employee_count, est_revenue, k_beauty_flag, status) VALUES
('Basharacare', 'basharacare.com', 'GCC', 'Tier2', 'Maya Berberi', 'Director of Partnerships', 'partnerships@basharacare.com', 15, '$5M-$10M', 'Y', 'Contacted'),
('Namshi', 'namshi.com', 'GCC', 'Tier1', 'Ahmad Al-Mansouri', 'Head of Beauty', 'ahmad@namshi.com', 500, '$100M+', 'Unknown', 'Cold'),
('Ounass', 'ounass.ae', 'GCC', 'Tier1', 'Fatima Al-Zahra', 'Beauty Buyer', 'fatima@ounass.ae', 200, '$50M+', 'Unknown', 'Cold'),
('Noon', 'noon.com', 'GCC', 'Tier1', 'Mohammed Al-Dosari', 'Beauty Category Manager', 'beauty@noon.com', 2000, '$500M+', 'Unknown', 'Cold');

-- KPI 스냅샷 샘플 데이터 (7일치)
INSERT INTO kpi_snapshots (snapshot_date, region, emails_sent, emails_opened, emails_replied, open_rate, reply_rate, bounce_rate, spam_rate, new_leads) VALUES
(CURRENT_DATE - 6, 'GCC', 8, 5, 1, 62.5, 12.5, 0, 0, 1),
(CURRENT_DATE - 6, 'USA', 7, 3, 0, 42.8, 0, 0, 0, 0),
(CURRENT_DATE - 6, 'Europe', 6, 3, 1, 50.0, 16.7, 0, 0, 1),
(CURRENT_DATE - 5, 'GCC', 9, 6, 1, 66.7, 11.1, 0, 0, 1),
(CURRENT_DATE - 5, 'USA', 7, 2, 0, 28.6, 0, 0, 0, 0),
(CURRENT_DATE - 5, 'Europe', 7, 4, 1, 57.1, 14.3, 0, 0, 1),
(CURRENT_DATE - 4, 'GCC', 10, 5, 2, 50.0, 20.0, 0, 0, 2),
(CURRENT_DATE - 4, 'USA', 6, 2, 0, 33.3, 0, 0, 0, 0),
(CURRENT_DATE - 4, 'Europe', 6, 3, 0, 50.0, 0, 0, 0, 0),
(CURRENT_DATE - 3, 'GCC', 10, 7, 1, 70.0, 10.0, 0, 0, 1),
(CURRENT_DATE - 3, 'USA', 8, 3, 0, 37.5, 0, 0.02, 0, 0),
(CURRENT_DATE - 3, 'Europe', 7, 4, 1, 57.1, 14.3, 0, 0, 1),
(CURRENT_DATE - 2, 'GCC', 11, 7, 2, 63.6, 18.2, 0, 0, 2),
(CURRENT_DATE - 2, 'USA', 8, 2, 0, 25.0, 0, 0, 0, 0),
(CURRENT_DATE - 2, 'Europe', 7, 4, 1, 57.1, 14.3, 0, 0, 1),
(CURRENT_DATE - 1, 'GCC', 12, 8, 2, 66.7, 16.7, 0, 0, 2),
(CURRENT_DATE - 1, 'USA', 8, 2, 0, 25.0, 0, 0, 0, 0),
(CURRENT_DATE - 1, 'Europe', 8, 4, 1, 50.0, 12.5, 0, 0, 1),
(CURRENT_DATE, 'GCC', 9, 6, 2, 66.7, 22.2, 0, 0, 2),
(CURRENT_DATE, 'USA', 7, 1, 0, 14.3, 0, 0, 0, 0),
(CURRENT_DATE, 'Europe', 6, 3, 1, 50.0, 16.7, 0, 0, 1);

SELECT 'Setup complete ✅' as result,
  (SELECT count(*) FROM buyers) as buyers_count,
  (SELECT count(*) FROM kpi_snapshots) as kpi_count;
