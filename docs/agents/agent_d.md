# 직원 D — 수동 초안 생성 경로 (generate-draft)

> **ADR-046(PR18) 기준**: 배치 자동 초안 경로(`run-pipeline` 내부 agentD) **전체 삭제**. 본 문서는 PR18 이후 유지되는 **수동 경로** 정의. 사용자가 Buyers DB 페이지에서 수동으로 트리거하는 Claude 호출을 "직원 D"로 재정의.

## 역할
사용자가 EmailComposeModal의 "바이어 인텔" 탭에서 버튼을 누르면, `recent_news` + `intel_score` + 담당자 컨텍스트를 받아 Claude가 **국문 초안** → **영문 번역** 2단계로 초안을 생성.

## 진입점
- UI: [EmailComposeModal.tsx](../../app/components/EmailComposeModal.tsx) "바이어 인텔" 탭
- Edge Function: [generate-draft/index.ts](../../supabase/functions/generate-draft/index.ts)

## action 파라미터 3종
1. `generate_ko` — 국문 초안 생성 (DB 저장 X, 응답만 반환)
2. `translate_save` — 국문 → 영문 번역 + `email_drafts` INSERT (subject_line_1, body_first 저장)
3. `translate_only` — 번역만 (저장 없음, 미리보기용)

## 환경변수
- `ANTHROPIC_API_KEY` (필수)
- `TRACK_BASE_URL` (선택, 기본 `https://app.spscos.com/go`) — 본문 URL 추적용

## 프롬프트 HARD LIMITS (PR17/ADR-043)
영문 번역 시 7개 규칙 강제:
1. **MAX_WORDS 180** (서명 5줄 포함, PR17.1/ADR-044에서 150→180 상향)
2. 금지 오프닝 6종: "I hope this finds you well" / "I was pleased to see" / "I came across" 등
3. 설교조 금지 (일반화 문장 X, 구체 관찰만)
4. 회사 소개 독립 문단 금지 → 1줄 인용만
5. **Korea/K-Beauty/Korean** 중 1개 이상 자연 삽입 필수
6. URL은 본문 중간에 (P.S. 단독 URL 금지)
7. 첫 인사 `Hi {firstName}` 고정

## SPAM_WORDS 50개
코포레이트 자갈 단어 목록 (`leveraging`, `synergies`, `best-in-class`, `cutting-edge` 등) — 프롬프트에 "피하라" 명시.

## 서명 블록 (PR17.1/ADR-044, 5줄 고정)
```
Warm regards,

Teddy Shin
Managing Director, SPS International
Email: teddy@spscos.com | Web: spscos.com | Mobile: (등록 번호)
(등록 주소)
```
이모지 미사용. `Donghwan Shin` 사용 금지.

## 한글 혼입 가드 (ADR-026)
`translate_save` 는 사용자 수동 경로 특성상 한글 잔류 시 UI에 즉시 경고. 3회 재번역 재시도 후에도 한글 포함이면 저장 실패 반환.

## 관련 ADR
- [ADR-043](../DECISIONS.md) — PR17 실측 스팸 역추적 HARD LIMITS 7건
- [ADR-044](../DECISIONS.md) — PR17.1 서명 5줄 블록 + MAX_WORDS 180
- [ADR-046](../DECISIONS.md) — PR18 배치 agentD 삭제, 수동 경로 단일화
- [feedback_manual_draft_only](../../memory/feedback_manual_draft_only.md) — 배치 자동 초안 재도입 금지
- [feedback_signature_convention](../../memory/feedback_signature_convention.md) — 5줄 풀 블록 서명
