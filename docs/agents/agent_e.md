# 직원 E — 수동 스팸 검증 경로 (validate-draft)

> **ADR-046(PR18) 기준**: 배치 자동 검증(`run-pipeline` 내부 agentE) **전체 삭제**. 본 문서는 수동 경로용 `validate-draft` Edge Function 정의. 사용자가 초안 저장 시 1회 자동 호출.

## 역할
`email_drafts` 레코드의 영문 본문(body_first)에 대해:
1. **규칙 기반 검사** (SPAM_WORDS 50 + HARD LIMITS 7 + 단어 수 + Korea/K-Beauty 포함)
2. **Claude 기반 점수** (1~10, 10=안전 / 1=위험 — ADR-001 방향 주의)
3. 결과 → `spam_status` (`pass` / `warning` / `flag`) + `spam_score` 업데이트

## 진입점
- Edge Function: [validate-draft/index.ts](../../supabase/functions/validate-draft/index.ts)
- 호출 시점: EmailComposeModal `handleSaveDraft` 에서 `email_drafts` UPDATE 직후 자동 fetch (1회)

## 환경변수
- `ANTHROPIC_API_KEY` (필수) — Claude 점수 평가

## 판정 워크플로
- `spam_score ≥ 8` → `pass`, 저장 유지, UI 초록 배지
- `spam_score 5~7` → `warning`, 저장 유지, UI 주황 배지 + 개선 힌트 표시
- `spam_score < 5` → `flag`, 저장되지만 발송 버튼 UI에 경고. Teddy가 본문 직접 수정 후 재저장 → validate-draft 재호출.

## ADR-046 이후 변경: 자동 재생성 루프 제거
PR18 이전에는 `MAX_REGEN=2` 자동 재생성 루프가 있었음. 수동 경로 단일화 이후엔:
- validate-draft는 **1회 검증만** 수행
- flag 시 사용자가 수동으로 본문 다듬고 재저장
- `generate-draft` 자동 재호출 없음 (비용 절감 + 예측 가능성 확보)

## 스팸 점수 스케일 주의 (ADR-001)
**10 = 안전, 1 = 위험** — 방향 혼동 주의. UI 색상:
- ≥8 초록 / 5~7 주황 / <5 빨강

## 규칙 검사 항목
- SPAM_WORDS 50 포함 건수 → 각 -1점
- 단어 수 180 초과 → -2점
- Korea/K-Beauty/Korean 누락 → -2점
- 금지 오프닝 매칭 → -3점
- URL P.S. 단독 배치 → -1점

## 관련 ADR
- [ADR-001](../DECISIONS.md) — 스팸 점수 스케일 10=안전, 1=위험
- [ADR-043](../DECISIONS.md) — PR17 실측 스팸 역추적 7 규칙
- [ADR-046](../DECISIONS.md) — PR18 배치 agentE 삭제 + 자동 재생성 루프 제거
