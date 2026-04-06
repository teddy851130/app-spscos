-- ============================================
-- SPS International 바이어 발굴팀 DB 스키마
-- ============================================

-- 1. 바이어 테이블
CREATE TABLE IF NOT EXISTS buyers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name TEXT NOT NULL,
  website TEXT,
  region TEXT NOT NULL CHECK (region IN ('GCC', 'USA', 'Europe')),
  tier TEXT NOT NULL CHECK (tier IN ('Tier1', 'Tier2', 'Tier3')),
  contact_name TEXT,
  contact_title TEXT,
  contact_email TEXT,
  linkedin_url TEXT,
  employee_count INTEGER,
  est_revenue TEXT,
  k_beauty_flag TEXT DEFAULT 'Unknown' CHECK (k_beauty_flag IN ('Y', 'N', 'Unknown')),
  status TEXT DEFAULT 'Cold' CHECK (status IN ('Cold', 'Contacted', 'Replied', 'Interested', 'Sample', 'Deal', 'Lost')),
  clay_id TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 이메일 로그 테이블
CREATE TABLE IF NOT EXISTS email_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  buyer_id UUID REFERENCES buyers(id) ON DELETE CASCADE,
  email_type TEXT NOT NULL CHECK (email_type IN ('initial', 'followup1', 'followup2', 'breakup')),
  subject TEXT NOT NULL,
  body_en TEXT,
  body_ko TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'opened', 'replied', 'bounced', 'spam')),
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  gmail_message_id TEXT,
  pipedrive_bcc_sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 파이프라인 실행 로그
CREATE TABLE IF NOT EXISTS pipeline_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  run_date DATE NOT NULL DEFAULT CURRENT_DATE,
  employee TEXT NOT NULL CHECK (employee IN ('A', 'B', 'C', 'D', 'E', 'F')),
  region TEXT CHECK (region IN ('GCC', 'USA', 'Europe', 'ALL')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  input_count INTEGER DEFAULT 0,
  output_count INTEGER DEFAULT 0,
  notes TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. KPI 일별 스냅샷
CREATE TABLE IF NOT EXISTS kpi_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  region TEXT NOT NULL CHECK (region IN ('GCC', 'USA', 'Europe')),
  emails_sent INTEGER DEFAULT 0,
  emails_opened INTEGER DEFAULT 0,
  emails_replied INTEGER DEFAULT 0,
  emails_bounced INTEGER DEFAULT 0,
  open_rate DECIMAL(5,2),
  reply_rate DECIMAL(5,2),
  bounce_rate DECIMAL(5,2),
  spam_rate DECIMAL(5,2),
  new_leads INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(snapshot_date, region)
);

-- 5. Row Level Security (RLS) — anon key로 읽기만 허용
ALTER TABLE buyers ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_snapshots ENABLE ROW LEVEL SECURITY;

-- anon 읽기 허용 정책
CREATE POLICY "anon can read buyers" ON buyers FOR SELECT USING (true);
CREATE POLICY "anon can read email_logs" ON email_logs FOR SELECT USING (true);
CREATE POLICY "anon can read pipeline_runs" ON pipeline_runs FOR SELECT USING (true);
CREATE POLICY "anon can read kpi_snapshots" ON kpi_snapshots FOR SELECT USING (true);

-- anon 쓰기 허용 (나중에 service_role으로 제한 예정)
CREATE POLICY "anon can insert buyers" ON buyers FOR INSERT WITH CHECK (true);
CREATE POLICY "anon can update buyers" ON buyers FOR UPDATE USING (true);
CREATE POLICY "anon can insert email_logs" ON email_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "anon can update email_logs" ON email_logs FOR UPDATE USING (true);
CREATE POLICY "anon can insert pipeline_runs" ON pipeline_runs FOR INSERT WITH CHECK (true);
CREATE POLICY "anon can insert kpi_snapshots" ON kpi_snapshots FOR INSERT WITH CHECK (true);
CREATE POLICY "anon can update kpi_snapshots" ON kpi_snapshots FOR UPDATE USING (true);

-- 6. 샘플 데이터 삽입
INSERT INTO buyers (company_name, website, region, tier, contact_name, contact_title, contact_email, employee_count, est_revenue, k_beauty_flag, status) VALUES
('Basharacare', 'basharacare.com', 'GCC', 'Tier1', 'Maya Berberi', 'Director of Partnerships', 'partnerships@basharacare.com', 15, '$5M-$10M', 'Y', 'Contacted'),
('Namshi', 'namshi.com', 'GCC', 'Tier1', 'Ahmad Al-Mansouri', 'Head of Beauty', 'ahmad@namshi.com', 500, '$100M+', 'Unknown', 'Cold'),
('Ounass', 'ounass.ae', 'GCC', 'Tier1', 'Fatima Al-Zahra', 'Beauty Buyer', 'fatima@ounass.ae', 200, '$50M+', 'Unknown', 'Cold'),
('Noon', 'noon.com', 'GCC', 'Tier1', 'Mohammed Al-Dosari', 'Beauty Category Manager', 'beauty@noon.com', 2000, '$500M+', 'Unknown', 'Cold');

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
