# Sprint04 Plan v3 — Evaluator Review (Round 3)

> 2026-04-20 작성. Generator/Evaluator 루프 3회차. v1(84) → v2(93) → v3 재채점. 목표 95+.

## 총점: 96 / 100 (v1 84 → v2 93 → v3 96, 증감 +3)

## 항목별 점수 (v2 대비 증감)
- A. 문제 커버리지: 38 / 40 (±0) — scope 한정으로 유지. PR 순서/개수 무변경, #9(에이전트 md) Sprint05 이월 구조 동일.
- B. 구체성: 20 / 20 (+1) — PR18 fetch 샘플 코드 완전 제공(45초 timeout + AbortController + MAX_REGEN=2 분기 + SERVICE_ROLE_KEY 폴백). v2 감점 1 해소.
- D. 리스크/대안: 10 / 10 (+1) — PR0 STOP 시 DMARC 리포트별 3분기(SPF soft-fail / DKIM 누락 / DMARC rua) + 유예 중 병행 허용 작업 + 현재 상태 4/5 기록. v2 감점 1 해소.
- C. 회신율 실효성: 19 / 20 (+1) — 실측 스팸 7개 트리거 PR17/PR18 프롬프트 직접 삽입 + 국문 AI 냄새 루브릭 3건 추가로 국문·영문 양측 커버. 감점 1은 여전히 Pipedrive BCC vs click_events 시그널 혼동 §9-2 트리거 ①에 잔존(v2 중요 gap 2 미교정).
- E. 실행 가능성: 9 / 10 (±0) — v3 추가분은 스코프 한정이라 실행 단계 체감 증가 적음. PR17 공수 "2~3h 증가 감당" 명시로 현실 공수 반영. v2 대비 변화 없음.

---

## v3 변경 5개 반영 체크

### [x] 1. PR17/PR18 스팸 7규칙 — **완전 반영**
- **증거**:
  - PR17 §"v3 추가 1" L134-L154: agentD 영문 프롬프트 HARD LIMITS 블록 7개 규칙 모두 포함 (MAX_WORDS=150 / 금지 오프닝 6개 / 설교 문단 금지 5개 / 회사 소개 1줄 / Hi firstName / Korea 필수 / URL 중간).
  - PR17 §"v3 추가 2" L160-L168: `generate_ko` 국문 프롬프트 6개 규칙 국문화(150단어→350자, 진부 도입 금지, 일반 업계 관찰 금지, 회사 소개 1문장, Korea/K-Beauty 1개, 과도 정중체 금지).
  - PR17 §"v3 추가 2" L170-L177: `translate_save` TRANSLATION HARD LIMITS 5개 (150 words / Hi firstName / 금지 오프닝 / Korea 생존 / URL inline).
  - PR17 §"v3 추가 3" L184-L192: SPAM_WORDS 15개 append 목록 명시, 중복 체크 완료 기재(최종 50).
  - PR17 §"v3 추가 4" L200-L212: validate-draft `checkSpamRules` Korea 누락 + 150단어 초과 2개 룰 TypeScript 코드 제공.

### [x] 2. 국문 AI 냄새 루브릭 3개 — **완전 반영**
- **증거**: PR17 §"v3 추가 5" L218-L221. v2 영문 5개 루브릭(계승 L223-L228)과 분리하여 국문 3개 감점 명시:
  - -1점: "귀사" 3회 이상 반복
  - -1점: "혹시" + "여쭤봅니다" 결합체
  - -1점: "최선을 다하겠습니다" 류 과도 정중체 마무리
- 판정 L230 "3점 미만 2개 이상 → 재수정 / 3점 이상 3~5개 → PR18 진입" v2 로직 계승. v2 사소 gap 2(AI 냄새 언어 치우침) 해소.

### [x] 3. PR0 STOP DMARC 분기 — **완전 반영 (3~5줄 목표 초과, 10줄+)**
- **증거**: PR0 §"STOP 시나리오 구체화" L91-L103:
  - **SPF soft-fail** 대응: DNS TTL 대기 + Google Workspace Admin 경로.
  - **DKIM 서명 누락** 대응: Workspace Admin Generate new record → `google._domainkey.spscos.com` CNAME/TXT + 48시간 전파.
  - **DMARC rua 미설정** 대응: `_dmarc.spscos.com` TXT `v=DMARC1; p=none; rua=mailto:...` 추가.
  - **유예 중 병행 허용**: PR17 local dry-run만 + 7개 트리거 회귀 테스트 + validate-draft 루프 로직 작성(배포 금지).
  - **현재 상태 4/5 Primary 기록**: STOP 아님 명시 + 토 재시험 2~3통 의무.
- v2 중요 gap 1 완전 해소.

### [x] 4. PR18 fetch 샘플 — **완전 반영**
- **증거**: PR18 §"v3 추가 1" L256-L301 `regenerateDraft` 함수 전체 TypeScript 샘플:
  - `SERVICE_ROLE_KEY ?? SUPABASE_SERVICE_ROLE_KEY` 폴백
  - `Authorization: Bearer ${serviceKey}` + `Content-Type: application/json`
  - `AbortController` + 45s timeout
  - request body: `action: "generate_ko"`, `buyer_id`, `contact_id`, `regenerate_context { attempt, previous_fail_reason, forbidden_patterns }`
  - MAX_REGEN=2 도달 시 `flag_regen_failed` 최종 반환
- 주의사항 4건(ADR-009 direct fetch / SERVICE_ROLE_KEY 폴백 / 45s 근거 / forbidden_patterns 주입 방식) 포함.
- PR18 §"v3 추가 2" L313-L322 사전 검증 SQL(최근 5건 word_count + has_korea + hi_greeting)까지 병행.
- v2 중요 gap 3 완전 해소.

### [x] 5. 일정 5/10 판정 — **완전 반영**
- **증거**:
  - §1-2 L26-L29: 임계일 2026-05-10(일) + 중간 체크 2026-05-07(목) ③+ 0건 조기 폐기 검토 + 벤치마크 참고만.
  - §7 일정 테이블 L410-L422: 1주차(구현+1차 발송) / 2주차(누적 발송 50통) / 3주차(관찰) / 중간 체크 5/7 / 최종 판정 5/10 / Sprint05 5/11~ 전체 3주 그리드 완성.
  - §9-2 L457-L467: 임계일 5/10 + 2중 트리거 유지 + 중간 체크포인트 4/26(토 발송 후) + 5/7(30~40통 시점) 2단 구성.
- v2 A안 Teddy 선택 "50통 + 1주일 관찰 5/10 판정" 요구 부합.

---

## 95점 도달 판정: **96점 — 실행 착수 OK**

### 판정 근거
- 95 이상 기준 충족: v2 대비 3점 상승 (B +1 / D +1 / C +1).
- v3 스코프 한정 5건 전부 본문에 정밀 반영 + v2 본문 전면 재작성 없이 "v2 계승" 블록 유지(L111-L121 PR16, L228-L238 PR17 나머지, L325-L332 PR18 나머지, L342 PR19, L347-L349 PR21-Docs, L354 PR22-Lite).
- PR 순서/개수 변경 없음 확인 (PR0/16/17/18/19/21-Docs/22-Lite + Sprint05 PR20/21-Code 이월).
- 이번 주 이 플랜으로 살아날 confidence: **85%+** (v2 80% 대비 +5%). 실측 스팸 7개 트리거 프롬프트 직접 삽입으로 Primary 5/5 재측정 통과 가능성 유의미 상승 근거.

### 4점 감점 분포
- A -2: #9(에이전트 md 분리 Sprint05 이월)로 스프린트 내 완결 아님(v2 계승 구조).
- C -1: §9-2 트리거 ① `click_events 0건 + Pipedrive BCC 회신 유입 0건` 표현 v2 그대로. Pipedrive BCC는 회신 자동 동기화용이라 "유입 0 = 회신 0" 트리거 ②와 중복 정보. v2 중요 gap 2 미교정(v3 스코프 5개에 포함되지 않아 의도적 패스로 해석 가능).
- E -1: v2 계승. PR0 "Teddy 5분"은 L107 "예상 공수 0 (완료)"로 이미 완료 표기 되어 현실 공수 문제 우회. PR17 공수 1일 유지(v3 추가 룰 2~3h 증가 감당 명시).

---

## 남은 gap

### 중요 (1건)
1. **§9-2 트리거 ① Pipedrive BCC 문구 교정 미반영** — v2 Review 중요 gap 2 잔존. v3 스코프 5건 밖이라 의도적 패스인지 불분명. 착수 후 4/26 중간 체크포인트 **전**에 단순 문구 교정(1줄): `click_events 클릭 0건 + Pipedrive BCC 회신 유입 0건` → `click_events 클릭 0건 + Gmail 수신함 회신 0건`. 파일 수정 5초.

### 사소 (1건)
2. **SPAM_WORDS 50개 중 복합구 포함 판정 로직 미명시** — v3 추가 15개에 `"rapid response capability"` / `"fully customized manufacturing partner"` 등 다단어 구(phrase)가 섞임. 현재 `checkSpamRules`가 단순 토큰 매칭인지 substring 매칭인지 코드 레벨 재확인 필요. 구현 PR 착수 시 inline 검증 1회(10분).

---

## 실행 착수 결정

**GATE: PASS (96/100 ≥ 95).**

- v3 스코프 한정 5건 전부 반영 + PR 순서·개수 변경 없음 + v2 본문 계승 원칙 준수.
- v2 중요 gap 3건 중 2건(DMARC 분기·fetch 샘플) 완전 해소. 나머지 1건(Pipedrive 문구)은 1줄 교정이므로 착수 후 인플라이트 처리.
- Teddy 사전 확정 2건(v2 Review에서 제기) 중 #1(STOP 시나리오 대안 플랜)은 v3 L91-L103로 자동 해소. #2(4/26 체크포인트 ③ 0건 판단 기준) 착수 전 1줄 합의만 필요.
- **월 오후 PR16 착수 승인 대기** (PR0 Primary 4/5로 STOP 아님 확인 완료).
