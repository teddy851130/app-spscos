-- 마이그레이션 004: Bounced 상태 추가 + last_sent_at 컬럼 추가
-- 실행 위치: Supabase Dashboard → SQL Editor
-- 날짜: 2026-04-12
--
-- 배경:
--   1. buyers.status CHECK에 'Bounced'가 없어서 반송 상태 표기 불가
--   2. buyers.last_sent_at 컬럼이 프론트에서 참조되지만 스키마에 없어서
--      Dashboard/Emails 쿼리에서 400 에러 발생

-- 1. buyers.status CHECK 제약에 'Bounced' 추가
ALTER TABLE buyers DROP CONSTRAINT IF EXISTS buyers_status_check;
ALTER TABLE buyers ADD CONSTRAINT buyers_status_check
  CHECK (status IN ('Cold', 'Contacted', 'Replied', 'Interested', 'Sample', 'Deal', 'Lost', 'Bounced'));

-- 2. last_sent_at 컬럼 추가 (프론트 5곳에서 이미 참조 중)
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMPTZ;

-- 3. 기존 email_logs에서 last_sent_at 역산 (이미 발송 기록이 있는 바이어)
UPDATE buyers b SET last_sent_at = sub.max_sent
FROM (
  SELECT buyer_id, MAX(sent_at) as max_sent
  FROM email_logs
  WHERE status = 'sent'
  GROUP BY buyer_id
) sub
WHERE b.id = sub.buyer_id;
