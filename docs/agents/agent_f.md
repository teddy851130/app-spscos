# 직원 F — 시스템 모니터링 + 경고 생성

## 역할
`run-pipeline` 마지막 단계에서 파이프라인 로그를 스캔해 경고를 생성하고 `system_alerts` 테이블에 기록. Dashboard "경고" 섹션에 노출.

## 진입점
- 코드: [run-pipeline/index.ts](../../supabase/functions/run-pipeline/index.ts) `agentF` 함수 (L562~)
- 호출: agentC 완료 후 자동 실행

## 경고 조건 (PR18 이후 B, C만 스캔)
- **직원 B 실패** — ZeroBounce 401/402/네트워크
- **직원 C 실패** — Perplexity 401/Claude 401/타임아웃
- **크레딧 부족** — ZeroBounce / Perplexity 잔액이 다음 실행 대상 건수 미만
- **intel_failed 비율** — 같은 실행에서 C 통과 대비 50%+ 실패 시 프롬프트 이상 의심

> PR18(ADR-046) 변경: 기존 `["B","C","D","E"]` → `["B","C"]`로 스캔 대상 축소. D/E 함수 자체가 삭제됨.

## 경고 레벨
- `critical` — 파이프라인 차단 (인증 실패, 크레딧 0)
- `warning` — 부분 실패 (일부 buyer 스킵됨, 재실행 권장)
- `info` — 정상 완료 리포트

## 환경변수
없음 (모든 입력은 Supabase 클라이언트 SB 경유)

## system_alerts 테이블 스키마
- `id` / `job_id` / `agent` (B|C|F) / `level` / `message` / `created_at`
- Dashboard가 `level IN ('critical','warning')` 최근 10건 표시

## 관련 ADR
- [ADR-046](../DECISIONS.md) — PR18 직원 D/E 삭제에 따른 agentF 스캔 범위 축소
- [feedback_api_credit_alert](../../memory/feedback_api_credit_alert.md) — 크레딧 부족 조용한 폴백 금지, 경고 박스 필수
