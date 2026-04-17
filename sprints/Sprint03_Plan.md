# Sprint 03 — 파이프라인 직원(A~F) 규칙 재설계

**시작일**: 2026-04-17  
**목표**: 직원 D 국문 초안이 스팸 가이드를 위반하는 근본 원인 해소. A~F 프롬프트·규칙 정비.

---

## 배경 (왜 지금?)

PR6 완료 후 실전 테스트에서 Teddy 발견:
> "바이어 인텔로 국문 초안 생성 후 아무 수정 없이 '영문에 반영 및 검증'만 눌러도 스팸 경고창이 뜸."

즉 **직원 D가 생성하는 초안 자체가 스팸 기준 미달**.  
발송 흐름(PR6)은 안정화됨. 이제 **콘텐츠 품질·규정**이 다음 관문.

---

## PR8 핫픽스로 해소된 항목 (이번 스프린트 이전)

- ✅ Edge Function 크래시 시 status 영구 고착 (ADR-018)
- ✅ invokePipeline 세션 JWT 만료 → 401 (ADR-019)
- ✅ 순차 처리 타임아웃 → BATCH_SIZE=5 + 재시도 (ADR-020)
- ✅ Desktop/claude/ 폴더 정리 (임시 스크립트 파일 12개 삭제)

---

## 스프린트 범위

### 우선순위 1 — 직원 D 프롬프트 재설계
현재 문제: SPAM_WORDS 회피 가이드 부재, 개인화 앵커 포인트 명시 불충분.

**목표**:
- D 프롬프트에 SPAM_WORDS(21개) 네거티브 제약 명시
- `recent_news` / `kbeauty_interest` / `recommended_formula` / `proposal_angle` 필수 반영 지시
- B2B 톤 일관성 (과장형 어휘 금지, CTA 규정)
- 생성 단계에서 스팸 회피 → validate-draft flag 비율 감소

### 우선순위 2 — 직원 C 채점 rubric 재조정
현재 문제: intel_score가 90-100 / NULL 양극화 (60~89 건수 = 0).  
4필드 채점 rubric 세분화 검토.

### 우선순위 3 — 직원 E SPAM_WORDS 목록 업데이트
현재 21개. 실전 테스트 중 flag된 단어 추가 검토.  
`run-pipeline.agentE` + `validate-draft` 양쪽 동기화.

### 우선순위 4 — 직원 B bounce/catch-all 정책 명문화
현재: ZeroBounce 결과별 처리 정책 코드에만 암묵적으로 존재.  
RUNBOOK.md 또는 DECISIONS.md에 명문화.

---

## 미해결 이슈 (별도 처리)

| 이슈 | 우선순위 | 비고 |
|---|---|---|
| "오늘 보낼 메일" 회사 미상 표시 | 중 | UI 버그 |
| 초안 영문/국문 혼재 | 중 | UI 버그 |
| 스팸 "수정" 버튼 → "위험 낮음" 반환 | 중 | validate-draft 로직 |
| 바이어 인텔 3개 미수집 | 저 | 유효 이메일 없음, 대안 필요 |
| 429 경고 간헐 발생 | 저 | Claude API 할당량 제한 |

---

## 검증 방식

각 직원별 수정 후 **6축 리뷰어 서브 에이전트** 감사 (PR6와 동일 방식):
1. 기능 정상 작동 확인
2. 스팸 flag 비율 감소 확인
3. 타입 오류 없음 (`npx tsc --noEmit`)
4. 기존 기능 비파괴 확인
5. ADR 작성
6. 배포 확인

---

## 참조 문서

- `project_sps_pipeline_agents_rules_review.md` — 직원별 정비 포인트 상세
- `project_sps_agent_queue.md` — PR7 큐 재설계 (이 스프린트와 독립, 이후 진행)
- `docs/DECISIONS.md` ADR-006 (인텔 품질 게이트), ADR-012 (한글 혼입 가드)
- `supabase/functions/run-pipeline/index.ts` — 직원 C/D/E/F 실제 코드

---

## 2026-04-17 착수 조사 결과 + Teddy 방향 확정

### 조사(Explore 3개 병렬) 핵심 발견
- **직원 A**: Tier 자동 판정 없음 (수동 CSV 의존). Apollo enrichment 결과 미활용.
- **직원 C**: Claude만 사용. `computeIntelScore` 게이트("4필드 중 1개라도 0점 → 전체 0점") + 길이 기반 이진 배점이 양극화 근본 원인.
- **직원 D**: `run-pipeline/index.ts:326` 프롬프트에 `"SPS value prop mentioning recommended_formula"` 명시 — 추천 제품 본문 직접 삽입. SPAM_WORDS implicit 지시만.

### Teddy 결정 → ADR
- **ADR-021**: 직원 D "제품 추천형" 폐기 → 문제 제기형 + 리서치 질문형 하이브리드. `recommended_formula`는 본문 삽입 금지, body_followup에서만 카테고리 수준 언급.
- **ADR-022**: 직원 C에 외부 웹 검색 도입. 우선순위 = 현재 MCP(firecrawl/context7) → Google Workspace MCP → Perplexity (품질 기준 선택).

### Supabase MCP 상태
이 세션에서 MCP 호출 시 `Unauthorized` — spawn 당시 env 미전달 추정. Teddy가 Claude Code 재시작 예정.

### 재시작 후 트리거 문구
**"Sprint03 시작 — 직원 D 프롬프트 재설계부터"**

→ 이 문구 입력 시 새 세션이 자동으로:
1. CLAUDE.md + MEMORY.md 로드
2. `project_sps_pipeline_agents_rules_review.md` 최신 섹션 참조
3. `docs/DECISIONS.md` ADR-021/022 기준 적용
4. Supabase MCP 연결 검증 → 직원 D 프롬프트 재작성 착수

---

## 2026-04-17 실행 결과 (Sprint03 1일 차 집중 작업)

### 실행한 PR
- **PR9** (`6a1974b`) — 직원 D 프롬프트 v1 (ADR-021). 제품 추천형 → 문제 제기형 + 객관식 CTA.
- **PR10** (통합 → PR11) — v2 (ADR-023). 감시형 표현 제거 + 단언형 CTA + 숫자 제거.
- **PR11** (`b303b71`) — v3 (ADR-024). **CIA + Challenger** 프레임워크. 세일즈 클리셰 15개 금지 + 고유명사 2개 의무 + P.S. 링크.
- **PR11.1 hotfix** (`e354876`) — v4 (ADR-025). 인사말 표준화 + **Warm-Confident 톤** + 반복 어휘 금지 + Claude 판정 rubric 구체화.

### Edge Function 배포 결과
- `run-pipeline` v22 → **v25**
- `generate-draft` v6 → **v10**
- `validate-draft` v3 → **v4**

### Sprint03 우선순위 달성도
- [x] **우선순위 1 — 직원 D 프롬프트 재설계** (PR9/10/11/11.1로 4단계 진화 완료)
- [ ] **우선순위 2 — 직원 C 채점 rubric 재조정** (PR12 Perplexity 도입과 함께 진행 예정)
- [ ] **우선순위 3 — 직원 E SPAM_WORDS 목록 확장** (미착수)
- [ ] **우선순위 4 — 직원 B bounce/catch-all 정책 명문화** (미착수)

### 후속 PR 계획 (`memory/project_sps_future_pr.md`에 상세 기록)
- **PR12** — Perplexity 바이어 인텔 웹 검색 (Teddy Perplexity Pro 가입 후 착수, Sprint03 우선순위 2와 통합)
- **PR13** — 클릭 추적 랜딩 페이지 + CRM 자동 프로토콜 (P.S. 링크 자산화)
- **PR14** (선택) — `email_drafts.spam_reason` 컬럼 + UI 노출

### 미해결 이슈 (Sprint03 외 이월)
- "오늘 보낼 메일" 회사 미상 표시 (UI 버그)
- 초안 영문/국문 혼재 (UI 버그)
- 스팸 "수정" 버튼 → "위험 낮음" 반환 (validate-draft 로직)
- 바이어 인텔 3개 미수집 (유효 이메일 없음)
- 429 경고 간헐 발생 (Claude API 할당량)
