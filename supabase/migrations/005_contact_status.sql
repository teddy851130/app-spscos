-- 마이그레이션 005: 담당자별 독립 상태 관리
-- 실행 위치: Supabase Dashboard → SQL Editor
-- 날짜: 2026-04-12
--
-- 배경: 같은 회사의 담당자 A와 B가 다른 상태일 수 ���음
--   예) 담당자 A는 회신받음, 담당자 B는 아직 미발송
--   기존에는 buyers.status (회사 단위)만 있어서 전체가 동일 상태로 표시됨

-- buyer_contacts에 contact_status 추가
-- NULL이면 상위 buyers.status를 상속 (기존 데이터 호환)
ALTER TABLE buyer_contacts ADD COLUMN IF NOT EXISTS contact_status TEXT
  CHECK (contact_status IN ('Cold', 'Contacted', 'Replied', 'Interested', 'Sample', 'Deal', 'Lost', 'Bounced'));
