---
name: Feedback - 외부 API 크레딧 부족 시 명시적 알림 의무
description: Perplexity·ZeroBounce 등 외부 API 크레딧 소진 시 조용히 패싱 금지 — pipeline_logs에 failed 기록 + agentF 경고 박스 노출 필수
type: feedback
originSessionId: 21a63ab3-e127-4fd4-a0d3-c51593fa444c
---
외부 API(Perplexity / ZeroBounce / Anthropic 등)의 크레딧·결제 관련 오류(402 / 429 rate 경고 / 400 insufficient credits)가 발생했을 때, 파이프라인이 조용히 폴백하거나 패싱하지 말 것. **반드시 사용자에게 명시적 알림**이 전달되어야 함.

**Why:** Teddy 2026-04-17 명시 요구. "50불 충전해놨는데, 만약 크레딧이 부족하면 나에게 알람을 줘야 돼. 크레딧 없다고 그냥 패싱되면 안되고." 과금 API는 청구일·사용량 가시성이 없으면 Teddy가 예산 초과를 뒤늦게 알게 됨.

**How to apply:**
- 외부 API 호출 wrapper 함수에 402/429/400 대응 로직 필수.
- `pipeline_logs`에 `status='failed'` + 구체 메시지 기록 ("Perplexity 크레딧 부족 (HTTP 402) — 충전 후 재실행").
- 직원 F(agentF)가 이 로그를 스캔해 `경고 N건:` 포맷에 포함 → Pipeline.tsx UI 경고 박스에 노출.
- 폴백 로직(Claude-only 처리 등)은 허용하되, 폴백했다는 사실 자체를 경고로 남겨야 함.
- ZeroBounce 크레딧 프리체크 패턴(ADR-028)을 외부 API 전체에 확장 적용.
