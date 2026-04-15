-- ============================================
-- 마이그레이션 010: buyer_contacts SELECT 정책 복원 (Hotfix)
-- ============================================
-- 배경:
--   Migration 001은 buyer_contacts에 "Allow all buyer_contacts" FOR ALL USING(true)
--   단일 정책으로 SELECT/INSERT/UPDATE/DELETE를 모두 허용했음.
--
--   Migration 007은 이 정책을 DROP한 뒤 INSERT/UPDATE 정책만 재생성하고
--   **SELECT 정책을 생성하지 않음** → RLS 활성 상태에서 기본 deny →
--   프론트에서 buyer_contacts 조회 시 빈 배열 → 담당자 정보가 UI에 표시 안 됨.
--
--   다른 테이블(buyers/pipeline_jobs/email_drafts 등)은 별도 SELECT 정책이 있어 무관.
--   buyer_contacts만 "Allow all" 포괄 정책에 의존하다가 구멍이 생긴 상황.
--
-- 해결: SELECT 정책을 명시적으로 복원.
--   읽기는 모든 사용자(익명 포함) 허용 — 다른 테이블과 일관성.
--   쓰기(INSERT/UPDATE)는 migration 007의 authenticated 정책 그대로 유지.

BEGIN;

-- 혹시 이름 동일한 정책이 남아있으면 제거 (idempotent)
DROP POLICY IF EXISTS "read buyer_contacts" ON buyer_contacts;

CREATE POLICY "read buyer_contacts"
  ON buyer_contacts FOR SELECT
  USING (true);

COMMIT;

-- ============================================
-- 검증 (수동)
-- ============================================
-- 1) 정책 확인 — SELECT 정책이 포함되어야 함
--    SELECT policyname, cmd FROM pg_policies WHERE tablename = 'buyer_contacts';
--
-- 2) anon 권한 확인
--    SET ROLE anon;
--    SELECT count(*) FROM buyer_contacts;
--    RESET ROLE;
--    → 실제 건수 반환되면 정상
