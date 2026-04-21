# 직원 C — Claude + Perplexity 기업 분석 (인텔)

## 역할
ZB 통과 바이어마다 Perplexity로 최근 웹 뉴스·공개 정보 수집 → Claude Sonnet에 주입 → `recent_news` (JSON 스니펫) + `intel_score` (0~100) 생성. **intel_score < 60 → `status='intel_failed'`** 로 마킹해 발송 대상에서 자동 제외.

## 진입점
- 코드: [run-pipeline/index.ts](../../supabase/functions/run-pipeline/index.ts) `agentC` 함수 (L303~)
- 호출: agentB 완료 후 자동 실행

## 환경변수
- `ANTHROPIC_API_KEY` (필수) — Claude Sonnet 호출
- `PERPLEXITY_API_KEY` (필수) — 웹 검색

## intel_score 공식
Claude가 루브릭 기반으로 0~100 산출:
- 기업 규모 (MOQ 3,000+ 감당 여부) 30점
- 최근 활동 증거 (채용/신제품/PR) 25점
- K-Beauty/OEM 관련성 25점
- 공개 데이터 신뢰도 20점

**임계값 60점** — 미달 시 `status='intel_failed'`, `recent_news` 는 저장되지만 EmailComposeModal에서 초안 생성 차단.

## 실패 분기
- Perplexity 401 → agentF "Perplexity 인증 실패" 경고, 해당 buyer 스킵, intel_failed 마킹 **안 함** (재시도 가능)
- Claude 401 → agentF "Anthropic 인증 실패" 경고
- Perplexity timeout → 45s abort, 해당 buyer만 스킵
- **status reset**: PR16에서 intel_failed 상태라도 agentC가 재실행되면 `status='Cold'` 로 되돌림 (race condition 방지)

## PR16 수정 포인트
- `fetchPerplexitySearch` 401 분기 — 별도 조기 종료
- `callPerplexityForBuyer` authFailed 플래그 전파
- 합격 블록에서 `status='Cold'` 명시 UPDATE (기존 intel_failed 레거시 복구)

## 관련 ADR
- [ADR-006](../DECISIONS.md) — intel_score 60점 임계값
- [ADR-020](../DECISIONS.md) — PR16 agentC status reset + race fix
- [feedback_api_credit_alert](../../memory/feedback_api_credit_alert.md)
