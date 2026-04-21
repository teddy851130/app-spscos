# 직원 A — 바이어 발굴 (CSV 업로드)

## 역할
Apollo/Clay로 수집한 바이어 후보를 CSV로 업로드해 `buyers` + `buyer_contacts` 테이블에 적재. 본 앱 내에서 자동 발굴은 없음 (Sprint01에서 배제 — ICP 정확도 외부 도구 우위).

## 진입점
- UI: [Pipeline.tsx](../../app/components/Pipeline.tsx) → "CSV 업로드" 드롭 영역
- 처리: `processCSVFile()` — 클라이언트에서 파싱 후 Supabase 직접 INSERT

## 입력 CSV 필수 컬럼
`company_name`, `domain`, `team` (GCC/USA/Europe), `tier` (Tier1/Tier2/Tier3), `contact_name`, `contact_email`, `contact_title`, `linkedin_url` (선택), `annual_revenue` (선택), `open_jobs_signal` (선택)

## ICP 필터 규칙
- **직무 키워드** (하나 이상): `buying` · `procurement` · `beauty` · `npd` · `sourcing` · `product development`
- **시니어리티 키워드** (하나 이상): `manager` · `senior manager` · `director` · Tier1에 한해 `vp` 추가
- **두 조건 AND** — 미통과 시 skipped로 카운트. Pipeline UI에 사유별 집계 표시 (ADR-048/PR22).

## 스킵 사유
1. domain 또는 company_name 누락
2. 기존 buyer인데 contact 정보 부족 (name/email/title 하나라도 누락)
3. ICP 직함 미달
4. 기존 buyer의 담당자 수가 이미 3명
5. 이메일 중복 (같은 기업 내)

## 1기업당 담당자 제한
최대 3명 (`buyer_contacts` 레벨). 4번째부터 skipped.

## 사전 중복 체크 SQL (Claude 세션 수동)
Apollo/Clay 결과 도메인 배열을 받으면 **CSV 업로드 전** 실행:
```sql
WITH candidates AS (
  SELECT unnest(ARRAY[
    'example1.com', 'example2.com'  -- ← 후보 도메인 교체
  ]) AS domain
)
SELECT c.domain, b.id AS existing_buyer_id, b.company_name, b.status, b.created_at
FROM candidates c
LEFT JOIN buyers b ON b.domain = c.domain OR b.website ILIKE '%' || c.domain || '%'
ORDER BY c.domain;
-- existing_buyer_id IS NOT NULL → 해당 도메인 제거 후 CSV 업로드
```

## 관련 ADR
- [ADR-003](../DECISIONS.md) — ICP 직함 필터 도입
- [ADR-048](../DECISIONS.md) — ICP 스킵 사유 UI 노출 + 중복체크 SQL 병기
- [feedback_buyer_dedup_check](../../memory/feedback_buyer_dedup_check.md) — 회사 후보 선정 직후 도메인 중복 사전 제거 의무
