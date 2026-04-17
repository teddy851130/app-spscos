-- ============================================
-- 롤백 011: 클릭 추적 (PR13)
-- ============================================
-- 주의: click_events 데이터와 buyer_contacts.tracking_token 모두 삭제됨.
-- 롤백 전 필요 시 백업:
--   CREATE TABLE click_events_backup AS SELECT * FROM click_events;

BEGIN;

DROP TABLE IF EXISTS click_events;

ALTER TABLE buyer_contacts
  DROP COLUMN IF EXISTS tracking_token;

NOTIFY pgrst, 'reload schema';

COMMIT;
