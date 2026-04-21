# 직원 B — ZeroBounce 이메일 유효성 검증

## 역할
`buyer_contacts.contact_email` 을 ZeroBounce API로 검증. 결과를 `buyer_contacts.email_status` 에 기록. 파이프라인 C 진입 전 단계.

## 진입점
- 코드: [run-pipeline/index.ts](../../supabase/functions/run-pipeline/index.ts) `agentB` 함수 (L137~)
- 호출: `run-pipeline` Edge Function POST `{team: 'GCC'|'USA'|'Europe'}` — 대시보드 "파이프라인 실행" 버튼

## 환경변수
- `ZEROBOUNCE_API_KEY` (필수)

## 사전 크레딧 체크
본 검증 루프 진입 전 `/v2/getcredits` 호출 —
- HTTP 401/403 → 인증 실패, agent 즉시 종료
- HTTP 402 → 결제 필요 (크레딧 소진)
- credits = 0 → 검증 대상 건수와 비교 후 경고

## 검증 결과 분류
ZeroBounce `status` 값 → `email_status` 매핑:
- `valid` → 통과, C 단계 진입
- `catch-all` / `unknown` → 조건부 통과 (Tier1만 허용, 그 외 제외)
- `invalid` / `spamtrap` / `abuse` / `do_not_mail` → 블랙리스트 처리

## 실패 분기
- 401/403 → agentF 경고 "ZeroBounce 인증 실패"
- 402 → agentF 경고 "크레딧 충전 필요"
- 네트워크 오류 → 재시도 없이 해당 contact만 스킵, 로그에 기록

## 관련 ADR
- [ADR-011](../DECISIONS.md) — ZeroBounce 크레딧 사전 체크 + 401/402 분기
- [feedback_api_credit_alert](../../memory/feedback_api_credit_alert.md) — 외부 API 크레딧 부족 조용한 폴백 금지
