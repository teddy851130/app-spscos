---
name: Feedback - 초안 생성은 수동 경로만
description: 이메일 초안은 Buyers DB 페이지 수동 경로(EmailComposeModal)로만 생성. 배치 자동 초안 경로(직원D/E) 폐기 — Edge Function 재도입 금지
type: feedback
originSessionId: 5102fe5a-88a1-4a93-bc09-c3617f9638da
---
이메일 초안 생성·스팸 검증은 **Buyers DB → 바이어 인텔 탭 → 국문 초안 → 영문 번역** 수동 경로만 사용. 파이프라인 배치로 자동 생성하지 않음.

**Why**: Teddy의 실제 사용 플로우는 바이어별로 인텔을 확인하면서 직접 초안을 다듬는 것. 파이프라인이 일괄 자동 생성해도:
- 사용자가 건드리지 않으니 Claude API 비용만 낭비
- Dashboard 초안 목록이 자동 산출물로 계속 쌓여 노이즈
- 자동 생성된 초안의 품질을 한 건씩 검수하는 비용이 수동 작성보다 크지 않음

PR18(ADR-046, 2026-04-21)에서 이 판단에 따라 **`run-pipeline`의 agentD(배치 영문 초안) + agentE(배치 스팸 검증) + 공용 헬퍼 전체 삭제**(1335→787줄, -548줄). Dashboard의 "이메일 초안 목록" / "검토 필요" / "인텔 대기" 3개 섹션도 동시 제거.

**How to apply**:
- 앞으로 run-pipeline은 직원 **B(ZeroBounce) → C(Claude 인텔) → F(모니터링)** 3단계만. D/E 재도입 금지.
- 초안 생성 경로는 `generate-draft` Edge Function의 `generate_ko` + `translate_save` 단독. 호출은 `EmailComposeModal` UI에서만.
- Dashboard에 배치 산출물 목록 섹션 재도입 금지 (사용자가 직접 다룰 수 없는 자동 생성물은 표시 가치 없음).
- `validate-draft` Edge Function은 수동 경로의 재검증용으로 유지. "MAX_REGEN=2 자동 재생성 루프" 같은 배치 회귀 기능은 수동 경로에 불필요 — 사용자가 flag 시 본인이 다듬어 재저장.
- Tone/HARD LIMITS/SPAM_WORDS/서명 등 품질 규약은 generate-draft/validate-draft 세 프롬프트(generate_ko/translate_save/checkSpamRules)에 유지.
- 누군가(미래 세션 Claude 포함) 파이프라인에 초안 자동화를 다시 제안하면, 이 메모리 근거로 반박 후 Teddy 명시 재합의 필요.
