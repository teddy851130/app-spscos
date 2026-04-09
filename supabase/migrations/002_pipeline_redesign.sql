-- ============================================
-- SPS Pipeline Redesign Migration
-- 백그라운드 실행을 위한 새 테이블 구조
-- ============================================

-- ============================================
-- 1. pipeline_jobs (파이프라인 실행 요청)
-- ============================================
CREATE TABLE IF NOT EXISTS pipeline_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  team TEXT NOT NULL CHECK (team IN ('GCC', 'USA', 'Europe')),
  current_agent TEXT CHECK (current_agent IN ('A', 'B', 'C', 'D', 'E', 'F')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_log TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. buyers 테이블 수정 (새 컬럼 추가)
-- ============================================
-- domain 컬럼 추가
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS domain TEXT;

-- annual_revenue 숫자형 컬럼 추가
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS annual_revenue NUMERIC;

-- open_jobs_signal 컬럼 추가
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS open_jobs_signal BOOLEAN DEFAULT FALSE;

-- recent_news 컬럼 추가 (직원 C 분석 결과 JSON)
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS recent_news JSONB;

-- team 컬럼 추가 (region과 별도로 팀 구분)
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS team TEXT CHECK (team IN ('GCC', 'USA', 'Europe'));

-- discovered_at 컬럼 추가
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS discovered_at TIMESTAMPTZ DEFAULT NOW();

-- is_blacklisted 컬럼 추가
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS is_blacklisted BOOLEAN DEFAULT FALSE;

-- job_id 컬럼 추가 (어떤 파이프라인에서 발굴했는지)
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES pipeline_jobs(id);

-- 기존 region 데이터를 team으로 복사
UPDATE buyers SET team = region WHERE team IS NULL;

-- domain을 website에서 추출
UPDATE buyers SET domain = REPLACE(REPLACE(website, 'https://', ''), 'http://', '')
WHERE domain IS NULL AND website IS NOT NULL;

-- ============================================
-- 3. buyer_contacts 테이블 수정 (새 컬럼 추가)
-- ============================================
-- email_status 컬럼 추가
ALTER TABLE buyer_contacts ADD COLUMN IF NOT EXISTS email_status TEXT
  CHECK (email_status IN ('valid', 'invalid', 'catch-all', 'risky', 'unknown'));

-- linkedin_url 컬럼 (기존 contact_linkedin → linkedin_url)
ALTER TABLE buyer_contacts ADD COLUMN IF NOT EXISTS linkedin_url TEXT;

-- work_history_summary 컬럼 추가
ALTER TABLE buyer_contacts ADD COLUMN IF NOT EXISTS work_history_summary TEXT;

-- 기존 contact_linkedin 데이터 마이그레이션
UPDATE buyer_contacts SET linkedin_url = contact_linkedin
WHERE linkedin_url IS NULL AND contact_linkedin IS NOT NULL;

-- ============================================
-- 4. email_drafts 테이블 (새로 생성)
-- ============================================
CREATE TABLE IF NOT EXISTS email_drafts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  buyer_contact_id UUID REFERENCES buyer_contacts(id) ON DELETE CASCADE,
  subject_line_1 TEXT,
  subject_line_2 TEXT,
  subject_line_3 TEXT,
  body_first TEXT,
  body_followup TEXT,
  tier TEXT CHECK (tier IN ('Tier1', 'Tier2')),
  spam_score NUMERIC,
  spam_status TEXT CHECK (spam_status IN ('pass', 'flag', 'rewrite')),
  is_sent BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 5. pipeline_logs 테이블 (새로 생성)
-- ============================================
CREATE TABLE IF NOT EXISTS pipeline_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID REFERENCES pipeline_jobs(id) ON DELETE CASCADE,
  agent TEXT NOT NULL CHECK (agent IN ('A', 'B', 'C', 'D', 'E', 'F')),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'skipped')),
  message TEXT,
  credits_used NUMERIC DEFAULT 0,
  api_cost_usd NUMERIC(10,4) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 6. RLS Policies (새 테이블)
-- ============================================
ALTER TABLE pipeline_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_logs ENABLE ROW LEVEL SECURITY;

-- pipeline_jobs RLS
CREATE POLICY "anon can read pipeline_jobs" ON pipeline_jobs FOR SELECT USING (true);
CREATE POLICY "anon can insert pipeline_jobs" ON pipeline_jobs FOR INSERT WITH CHECK (true);
CREATE POLICY "anon can update pipeline_jobs" ON pipeline_jobs FOR UPDATE USING (true);

-- email_drafts RLS
CREATE POLICY "anon can read email_drafts" ON email_drafts FOR SELECT USING (true);
CREATE POLICY "anon can insert email_drafts" ON email_drafts FOR INSERT WITH CHECK (true);
CREATE POLICY "anon can update email_drafts" ON email_drafts FOR UPDATE USING (true);

-- pipeline_logs RLS
CREATE POLICY "anon can read pipeline_logs" ON pipeline_logs FOR SELECT USING (true);
CREATE POLICY "anon can insert pipeline_logs" ON pipeline_logs FOR INSERT WITH CHECK (true);

-- ============================================
-- 7. 인덱스
-- ============================================
CREATE INDEX IF NOT EXISTS idx_pipeline_jobs_status ON pipeline_jobs(status);
CREATE INDEX IF NOT EXISTS idx_pipeline_jobs_team ON pipeline_jobs(team);
CREATE INDEX IF NOT EXISTS idx_buyers_domain ON buyers(domain);
CREATE INDEX IF NOT EXISTS idx_buyers_team ON buyers(team);
CREATE INDEX IF NOT EXISTS idx_buyers_tier ON buyers(tier);
CREATE INDEX IF NOT EXISTS idx_buyers_is_blacklisted ON buyers(is_blacklisted);
CREATE INDEX IF NOT EXISTS idx_buyer_contacts_email_status ON buyer_contacts(email_status);
CREATE INDEX IF NOT EXISTS idx_email_drafts_spam_status ON email_drafts(spam_status);
CREATE INDEX IF NOT EXISTS idx_pipeline_logs_job_id ON pipeline_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_logs_agent ON pipeline_logs(agent);

-- ============================================
-- 8. Updated_at 자동 갱신 트리거
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS buyers_updated_at ON buyers;
CREATE TRIGGER buyers_updated_at
  BEFORE UPDATE ON buyers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
