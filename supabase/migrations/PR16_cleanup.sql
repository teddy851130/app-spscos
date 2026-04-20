-- PR16 (ADR-036~039): 파이프라인 이월 버그 4건 fix에 따른 기존 데이터 정리
-- 실행 환경: Supabase Dashboard → SQL Editor (prod)
-- 실행자: Teddy 명시 승인 후에만
-- 작성일: 2026-04-20
--
-- 목적:
--   race condition으로 status='intel_failed' + intel_score>=60 모순 상태에 빠진 buyers를
--   status='Cold'로 reset해 PR16 이후 파이프라인에서 정상적으로 재진입하게 함.
--   코드 fix는 새 데이터엔 적용되나 기존 모순 row 4건(REFY·WHITES·Tarte·Nahdi 등)은 수동 정리 필요.
--
-- 단계: ① 사전 점검 → ② 백업 → ③ UPDATE → ④ 검증 → ⑤ 롤백(문제 시)
-- 각 블록을 "하나씩" 실행하며 결과를 확인한 뒤 다음 블록으로 넘어갈 것.

-- ============================================================
-- ① 사전 점검 — 정리 대상 건수와 샘플 확인 (읽기 전용)
-- ============================================================
-- 기대: 4~5건 정도. 수십+ 나오면 중단하고 원인 재확인.
SELECT
  count(*) AS target_count,
  array_agg(company_name ORDER BY intel_score DESC) FILTER (WHERE rn <= 10) AS sample_names
FROM (
  SELECT
    id, company_name, intel_score, status, analysis_failed_at,
    row_number() OVER (ORDER BY intel_score DESC) AS rn
  FROM buyers
  WHERE status = 'intel_failed'
    AND intel_score >= 60
    AND recent_news IS NOT NULL
    AND analysis_failed_at IS NOT NULL
) sub;

-- 상세 샘플 (id, 점수, 회사명)
SELECT id, company_name, intel_score, status, analysis_failed_at
FROM buyers
WHERE status = 'intel_failed'
  AND intel_score >= 60
  AND recent_news IS NOT NULL
  AND analysis_failed_at IS NOT NULL
ORDER BY intel_score DESC
LIMIT 20;

-- ============================================================
-- ② 백업 — 복구용 테이블 생성 (CTAS)
-- ============================================================
-- 기대: ① 단계 target_count와 동일한 row 수 반환.
-- 실패 시 ③으로 진행 금지.
CREATE TABLE IF NOT EXISTS buyers_intel_recovery_20260420 AS
SELECT id, status, analysis_failed_at, intel_score, updated_at
FROM buyers
WHERE status = 'intel_failed'
  AND intel_score >= 60
  AND recent_news IS NOT NULL
  AND analysis_failed_at IS NOT NULL;

-- 백업 테이블 건수 확인
SELECT count(*) AS backup_rows FROM buyers_intel_recovery_20260420;

-- ============================================================
-- ③ UPDATE — 모순 상태 정리
-- ============================================================
-- 합격 조건(intel_score >= 60)인데 intel_failed로 잘못 마킹된 row만 Cold로 reset.
-- 새 PR16 코드(agentC 합격 블록)가 이후 같은 race를 만들지 않도록 수정됨.
UPDATE buyers
SET
  status = 'Cold',
  analysis_failed_at = NULL,
  updated_at = now()
WHERE status = 'intel_failed'
  AND intel_score >= 60
  AND recent_news IS NOT NULL
  AND analysis_failed_at IS NOT NULL;
-- 실행 후 영향 row 수가 ① target_count와 일치하는지 확인.

-- ============================================================
-- ④ 검증 — 정리 후 상태 점검
-- ============================================================
-- 기대:
--   (a) 모순 row: 0건 (target_count=0)
--   (b) 정리된 row: status='Cold' + analysis_failed_at IS NULL로 전환 확인
SELECT count(*) AS remaining_conflicts
FROM buyers
WHERE status = 'intel_failed'
  AND intel_score >= 60
  AND recent_news IS NOT NULL
  AND analysis_failed_at IS NOT NULL;

-- 백업된 id를 기준으로 현재 상태 재확인
SELECT b.id, b.company_name, b.status, b.intel_score, b.analysis_failed_at
FROM buyers b
JOIN buyers_intel_recovery_20260420 r ON b.id = r.id
ORDER BY b.intel_score DESC
LIMIT 20;

-- ============================================================
-- ⑤ 롤백 (문제 발생 시에만 실행) — 원상 복구
-- ============================================================
-- 경고: ③ UPDATE 직후에만 의미 있음. 이후 다른 작업으로 상태가 바뀌었다면
-- 기대와 다를 수 있음. 반드시 ④ 단계 결과를 보고 판단.
--
-- UPDATE buyers b
-- SET
--   status = r.status,
--   analysis_failed_at = r.analysis_failed_at,
--   updated_at = now()
-- FROM buyers_intel_recovery_20260420 r
-- WHERE b.id = r.id;

-- ============================================================
-- ⑥ 마무리 (⑤ 롤백이 불필요한 경우) — 백업 테이블 archive
-- ============================================================
-- 검증 완료 후 백업 테이블을 유지할지/제거할지는 Teddy 판단.
-- 유지 권장(2주) 후 삭제:
-- DROP TABLE buyers_intel_recovery_20260420;

-- ============================================================
-- 참고: Emails.tsx 폴백 필터 변경은 코드 전용이라 별도 migration 불필요.
--   (Contacted·Replied·Sample·Deal·Lost·Bounced 만 허용으로 좁힘)
-- ============================================================
