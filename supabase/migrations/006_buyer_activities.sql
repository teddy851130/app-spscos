-- ============================================
-- 마이그레이션 006: 바이어 활동 이력 (buyer_activities)
-- 실행 위치: Supabase Dashboard → SQL Editor
-- 날짜: 2026-04-14
--
-- 배경: 바이어별 타임라인(이메일, 상태변경, 미팅 등)을
--   한 곳에서 추적하기 위한 활동 로그 테이블
-- ============================================

-- ============================================
-- 1. buyer_activities 테이블 생성
-- ============================================
CREATE TABLE IF NOT EXISTS buyer_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 어떤 바이어의 활동인지
  buyer_id UUID NOT NULL REFERENCES buyers(id) ON DELETE CASCADE,
  -- 특정 담당자와 연결된 활동이면 지정 (선택)
  contact_id UUID REFERENCES buyer_contacts(id) ON DELETE SET NULL,
  -- 활동 유형
  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'discovered',          -- 바이어 최초 발굴
    'email_sent',          -- 이메일 발송
    'email_replied',       -- 바이어 회신
    'status_change',       -- 상태 변경
    'note',                -- 메모/노트
    'meeting',             -- 미팅
    'sample',              -- 샘플 발송/수령
    'followup_scheduled'   -- 팔로업 예약
  )),
  -- 활동 설명 (자유 텍스트)
  description TEXT,
  -- 추가 데이터 (이메일 제목, 이전/이후 상태 등)
  metadata JSONB DEFAULT '{}',
  -- 누가 생성했는지 (system, 사용자 이름 등)
  created_by TEXT DEFAULT 'system',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 2. buyers 테이블에 컬럼 추가
-- ============================================
-- 다음 팔로업 예정일 (팔로업 큐에서 사용)
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS next_followup_at TIMESTAMPTZ;

-- 발송한 이메일 수 카운터
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS email_count INTEGER DEFAULT 0;

-- ============================================
-- 3. 인덱스
-- ============================================
-- 바이어별 활동 조회 (가장 빈번한 쿼리)
CREATE INDEX IF NOT EXISTS idx_buyer_activities_buyer_id
  ON buyer_activities(buyer_id);

-- 타임라인 정렬용 (최신순)
CREATE INDEX IF NOT EXISTS idx_buyer_activities_created_at
  ON buyer_activities(created_at DESC);

-- 팔로업 큐 조회용 (다음 팔로업 날짜 기준 정렬)
CREATE INDEX IF NOT EXISTS idx_buyers_next_followup_at
  ON buyers(next_followup_at);

-- ============================================
-- 4. RLS 정책
-- ============================================
ALTER TABLE buyer_activities ENABLE ROW LEVEL SECURITY;

-- anon: 읽기만 허용
CREATE POLICY "anon can read buyer_activities"
  ON buyer_activities FOR SELECT USING (true);

-- service_role: 모든 쓰기 허용 (INSERT/UPDATE/DELETE)
-- service_role은 RLS를 우회하므로 별도 정책 불필요
-- anon의 쓰기를 명시적으로 차단하기 위해 INSERT/UPDATE/DELETE 정책을 생성하지 않음
