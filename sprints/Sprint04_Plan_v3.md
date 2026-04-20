# Sprint04 수정 계획 v3 — 실측 스팸 메일 역추적 반영

> 2026-04-20 작성. Generator/Evaluator 루프 3회차. v2(93/100) → 95+ 목표.
> v2 전면 재작성이 아닌 **스코프 한정 5가지 변경**만 반영. PR 순서·개수 무변경.

## v2 대비 핵심 변경 요약 (5건)

1. **실측 스팸 메일 역추적 → PR17/PR18 프롬프트 규칙 7개 추가** (회신율 실효성 보강). Teddy 월 오전 자기 앞 5통 발송 결과 4/5 Primary + 1/5 Spam. 스팸 간 전문 분석으로 금지 규칙 7개 식별.
2. **PR17 국문 AI 냄새 5점 루브릭에 국문 감점 3건 추가** (v2 루브릭은 영문 편중).
3. **PR0 STOP 시나리오 3줄 구체화** (DMARC 리포트별 분기 + STOP 유예 중 병행 허용 작업 + 현재 상태 4/5 Primary 기록).
4. **PR18 validate-draft → generate-draft Edge Function 간 fetch 샘플 코드 삽입** (v2는 경로만 명시, 실행 가능한 샘플 없음).
5. **일정 "5~10통 단회 + 5/4 판정" → "50통 누적 + 1주일 관찰 + 5/10 판정"** (Teddy A안 선택). 매몰비용 방지 중간 체크포인트 5/7 조기 폐기 검토.

---

## 1. 목표

### 1-1. 정성 목표 (v2 계승)
해외 바이어가 다른 콜드메일 100통 속에서 이 한 통만은 읽고 1줄이라도 회신하게 만드는 조건 — 담당자 본인 이름으로만 불리고, 한국 기업 정체성이 드러나며, 본문이 스팸·덩어리가 아닌 초개인화 메시지 — 를 성립시키는 것. **회신**이 KPI.

### 1-2. 정량 성공 기준 — 이중화 (v2 구조 유지, 수치만 재조정)

#### 1차 기준 (5~10통 단계) — 정성 루브릭
v2 루브릭 표 그대로 계승. ③ 이상 1건 + 본문 구체 참조 + 후속 질문이면 통과.

#### 2차 기준 (50통 누적 후 1주일 관찰) — 수치 + 질 교차
- **임계일 2026-05-10 (일)**: 50통 누적 + 1주일 회신 관찰 종료.
- **중간 체크포인트 2026-05-07 (목)**: ③+ 0건이면 조기 폐기 검토.
- 벤치마크(1~2% / 16~33%)는 참고만. OEM 시장 실측이 유일 검증.

#### 파이프라인 안정성 (v2 계승)
- race condition 없이 10명 발송 성공.

#### 비개발자 셀프 운영 (v2 계승)
- 각 PR에 복붙 SQL + 기대 결과 + 불일치 시 대응 3세트.

### 1-3. 비(非)목표 (v2 계승)
- 완전 자동 파이프라인 / 배포 자동화.
- UI 리디자인.
- 통합 웹사이트(spscos.com) 구축.

---

## 2. 접근 방식 & 근거

### 2-1. 우선순위 원칙 (v2 계승)
회신율 영향 = **수신자가 본문을 연 첫 5초의 인상 + 본문이 Primary 탭에 도달**.

- **Group 0 (BLOCKER)**: PR0 발송 인프라 점검.
- **Group 1 (CRITICAL)**: PR16 이월 버그 / PR17 담당자 분리+서명+URL+AI 냄새.
- **Group 2 (HIGH)**: PR18 스팸 자동 재생성+포맷+K-Beauty / PR19 팔로업.
- **Group 3 (LOW)**: PR21-Docs / PR22-Lite / 실전 발송.

**PR20 + PR21-Code Sprint05 이월 유지.**

### 2-2. v3 실측 반영 근거

**2026-04-20 월 오전 Teddy 자기 앞 5통 발송 실측**:
- Primary 4/5, Spam 1/5.
- DMARC 리포트: SPF Pass 100%, DKIM Pass 100%, Aligned. 인증 측 완벽.
- IP `209.85.208.47` Blacklisted (Google 공유 IP, 영향 0.76%, 개인 해결 불가).

**결론**: Primary 80%는 **콘텐츠/평판/발송 패턴** 문제이지 인증이 아님. PR17/PR18 프롬프트 규칙 보강이 실효 경로.

**스팸 간 전문 1통 역추적으로 식별한 7개 트리거** (PR17/PR18에 반영):
| # | 트리거 (실측 메일 원문) | 고치는 방식 |
|---|------------------------|-------------|
| 1 | 본문 230+ 단어 | MAX_WORDS=150 상한 강제 |
| 2 | AI 오프닝 "I was pleased to see..." | 금지 오프닝 패턴 목록 |
| 3 | 설교조 인사이트 "We consistently notice that..." | 일반화 문단 금지, 구체 관찰만 |
| 4 | 자기 PR 문단 "SPS partners with premium beauty..." | 회사 소개 독립 문단 금지, 1줄 인용만 |
| 5 | 코포레이트 자갈 (leveraging 등) | SPAM_WORDS 35→50 확장 |
| 6 | Korea/K-Beauty/Korean 0건 | 강제 규칙 + validate-draft 신설 체크 |
| 7 | P.S. 단독 URL | PR17 본문 중간 삽입 재확인 |

### 2-3. 비파괴 원칙 (v2 계승)
- 각 PR 독립 롤백. Edge Function 이전 버전 복원 경로 명시.
- prod 배포는 매번 Teddy 명시 승인 후.

---

## 3. 단계별 실행 (PR 단위)

### PR0 — 발송 인프라 점검 (월 오전 — 이미 실시 완료)

**실시 결과 2026-04-20 월 오전**:
- **Primary 판정**: 4/5 (80%) — STOP 아님. 다만 Teddy "무조건 Primary" 요구 → PR17/PR18 실측 7개 규칙 적용 후 **재측정 필수**.
- **DMARC/SPF/DKIM**: SPF 100%, DKIM 100%, Aligned. 인증 측 완벽.
- **Blacklisted IP**: 209.85.208.47 (Google 공유 IP, 영향 0.76%, 개인 해결 불가).

**PR0 STOP 시나리오 구체화 (v2 1줄 → v3 확장)**:

- **Primary ≤2/5 (STOP 상황)** — DMARC 리포트별 분기:
  - **SPF soft-fail**: DNS TTL 대기 후 재조회 (1~24시간). Google Workspace Admin → Apps → Gmail → Authenticate email → SPF 레코드 확인.
  - **DKIM 서명 누락**: Google Workspace Admin → Apps → Google Workspace → Gmail → Authenticate email → Generate new record → DNS에 `google._domainkey.spscos.com` CNAME/TXT 등록 → 48시간 전파.
  - **DMARC rua 미설정**: DNS에 `_dmarc.spscos.com` TXT `v=DMARC1; p=none; rua=mailto:reports@spscos.com` 추가.

- **STOP 유예 중 병행 허용 작업**:
  - PR17 AI 냄새 프롬프트 튜닝 **local dry-run만** (Supabase prod 배포 금지).
  - 실측 스팸 메일 7개 트리거를 이용한 dry-run 회귀 테스트: 기존 초안 본문을 `checkSpamRules` 로컬에 통과시켜 신규 15개 단어 + 금지 오프닝 패턴 누락 여부만 확인.
  - validate-draft 재생성 루프 로직 작성은 가능하나 배포 금지.

- **현재 상태 (2026-04-20)**: Primary 4/5로 STOP 아님. PR16~19 정상 진행. 단, 토요일 1차 실전 발송 직전 **자기 앞 재시험 2~3통** 의무 — PR17/PR18 적용 후 Primary 5/5 확인 후 외부 발송.

- **Teddy 승인 포인트**: ✓ 이미 실시 완료. PR16 착수 승인 필요.
- **예상 공수**: 0 (완료).
- **의존성**: 없음.

---

### PR16 — 파이프라인 이월 버그 4건 일괄 fix (월 오후) — v2 계승

v2 PR16 본문 그대로. 변경 없음.

- 수정 파일: `run-pipeline/index.ts` (fetchPerplexitySearch 401 분기, callPerplexityForBuyer authFailed 분기, 합격 블록 `status='Cold'` 명시, agentD/E team 필터)
- `Emails.tsx` L50-L75 폴백 필터
- DB migration: intel_failed 복구 UPDATE + 백업 테이블 + 롤백 SQL
- Edge Function 재배포: `run-pipeline` 필요
- Teddy 검증 복붙 4세트 (v2 그대로)
- 예상 공수: 4h
- 의존성: PR0 Primary 판정 통과 (✓)

---

### PR17 — 담당자 분리 + Teddy Shin 서명 + spscos.com 본문 삽입 + AI 냄새 눈검수 (화)

v2 본문 계승. **v3 추가 블록**만 아래 2곳 삽입.

#### v3 추가 1 — 실측 스팸 역추적 프롬프트 규칙 7개 (run-pipeline agentD)

`run-pipeline/index.ts` L626-L687 agentD 영문 프롬프트에 아래 블록 **신규 추가**:

```
HARD LIMITS (anti-spam from 2026-04-20 test send analysis):
1. MAX_WORDS=150. Count words in body only. Reject if over.
2. Opening: must be a 1-sentence concrete observation about the buyer (product name, campaign, press release). FORBIDDEN openers:
   - "I was pleased to see"
   - "I was excited to notice"
   - "I hope this email finds you well"
   - "I came across your company"
   - "I wanted to reach out"
   - "I wanted to touch base"
3. NO preaching/generalization paragraph. FORBIDDEN phrasings:
   - "We consistently notice that..."
   - "When we observe how..."
   - "The more X, the more Y..."
   - "In today's market..."
   - "As the industry evolves..."
   Use ONE concrete observation about THIS buyer instead.
4. NO standalone company-pitch paragraph. SPS description must be ONE sentence inline inside another thought, e.g. "We make peptide serums and SPFs for brands like yours from our Korean facility." — never its own paragraph.
5. GREETING: "Hi ${firstName}," — NOT "Dear ${fullName},". firstName = contact_name.split(' ')[0].
6. Korea identity MANDATORY: body must contain at least ONE of [Korea, Korean, K-Beauty, Made in Korea] naturally woven in. Validate-draft will flag if missing.
7. URL placement: spscos.com inserted mid-body (between paragraph 2 and 3 or end of paragraph 2), NOT in P.S. and NOT as standalone line.
```

#### v3 추가 2 — generate-draft 국문+translate_save 프롬프트 동일 규칙 적용

`generate-draft/index.ts`:
- L144-L164 `generate_ko` 국문 프롬프트에 추가:
  ```
  필수 제약:
  - 본문 150단어 이하 (국문 기준 350자 이하).
  - 오프닝: 해당 바이어 구체 관찰 1문장. "안녕하세요, 건강하시죠" 류 진부 도입 금지.
  - 일반 업계 관찰 문단 금지 ("최근 뷰티 시장은..." 류 금지). 이 바이어 1가지 구체 사실만.
  - 회사 소개 독립 문단 금지. SPS 설명은 1문장 자연 삽입 (예: "한국 공장에서 펩타이드 세럼·SPF를 제조하는 파트너로...").
  - 본문에 Korea/K-Beauty/Korean OEM 중 최소 1개 자연 삽입.
  - 국문 과도 정중체 금지: "귀사" 3회 이상 금지, "혹시 여쭤봅니다" 결합체 금지, "최선을 다하겠습니다" 류 금지.
  ```
- L224-L246 `translate_save` 프롬프트에 추가:
  ```
  TRANSLATION HARD LIMITS (2026-04-20 test send analysis):
  - Final English body: max 150 words.
  - Greeting: "Hi ${firstName}," — if Korean source has "Dear" or full name, replace.
  - FORBIDDEN openers/phrasings (list above).
  - Korea/K-Beauty/Korean identity MUST survive translation (at least 1 occurrence).
  - URL inline mid-body, not P.S.
  ```

#### v3 추가 3 — SPAM_WORDS 35개 → 50개 확장 (3곳 동기화)

`run-pipeline/index.ts` L781-L793, `validate-draft/index.ts` L28-L38, `MailQueue.tsx` (있으면) — 아래 15개 append:

```ts
// 2026-04-20 ADR-043: 실측 스팸 메일 역추적으로 코포레이트 자갈 15개 추가 (35→50)
"leveraging", "multi-market", "rapid response capability",
"next phase of expansion", "i would be grateful",
"premium beauty brands across all categories",
"fully customized manufacturing partner", "formulation excellence",
"consistently notice", "manufacturing flexibility",
"long-term partnerships", "customer expectations",
"grown alongside", "export experience", "brief conversation",
```

**중복 체크 완료**: 현 35개와 신규 15개 겹치는 단어 없음. 최종 50개.

#### v3 추가 4 — validate-draft 신규 검증 룰 (Korea 누락 flag + 150단어 초과 flag)

`validate-draft/index.ts` `checkSpamRules` 함수 내 추가:

```ts
// 6. Korea/K-Beauty 식별어 누락 (2026-04-20 ADR-043)
const koreaPattern = /\b(korea|korean|k-?beauty|made in korea)\b/i;
if (!koreaPattern.test(body)) {
  issues.push("한국 정체성 키워드 누락 (Korea / Korean / K-Beauty / Made in Korea 중 1개 필요)");
}

// 7. 본문 150단어 초과
const wordCount = body.trim().split(/\s+/).filter(Boolean).length;
if (wordCount > 150) {
  issues.push(`본문 ${wordCount}단어 (최대 150)`);
}
```

#### v3 추가 5 — PR17 AI 냄새 5점 루브릭에 국문 감점 3건 추가

v2 PR17 AI 냄새 채점 루브릭(L272-L279)에 **국문 전용 감점** 3건 추가:

**국문 초안 감점** (5점에서 차감):
- -1점: "귀사" 3회 이상 반복
- -1점: "혹시" + "여쭤봅니다" 결합체 (과도한 정중)
- -1점: "~을 도와드릴 수 있도록 최선을 다하겠습니다" 류 과도 정중체 마무리

**영문 감점 (v2 계승 그대로)**:
- -1점: "I hope this email finds you well" / "just wanted to reach out" / "I wanted to touch base"
- -1점: 과도한 형용사 3회+
- -1점: 빈 약속 (transform your business / unlock potential)
- -1점: 첫 문장 40단어+
- -1점: 문단 간 연결 템플릿 (Furthermore / Additionally 반복)

**판정**: 3점 미만 2개 이상 → PR17 재수정. 3점 이상 3~5개 → PR18 진입.

#### 나머지 PR17 본문 (v2 그대로)

- 담당자 분리 MailQueue buyer_contacts JOIN
- Teddy Shin 서명 3체크박스 (EmailComposeModal L718, agentD L660, translate_save L236 직후 신규)
- spscos.com 본문 중간 삽입 (L662 P.S. 제거)
- uniqueBuyerIds → uniqueContactIds 전환 + totalCount "메일 수" 재정의
- regression 테스트 Rara Beauty 3/0 + 2/1 케이스

- **DB migration**: 불필요.
- **Edge Function 재배포**: `generate-draft` + `run-pipeline` + `validate-draft` **필요** (v3에서 validate-draft 추가 룰 때문에 재배포 범위 확대).
- **예상 공수**: 1일 (v3 추가 룰로 2~3h 증가 감당).
- **의존성**: PR16 완료.

---

### PR18 — 스팸 자동 재생성 + 본문 포맷 + K-Beauty 워딩 (수)

v2 본문 계승. **v3 추가 블록**만 2곳.

#### v3 추가 1 — validate-draft → generate-draft fetch 샘플 코드 (v2 경로만 명시 → v3 실행 가능 샘플)

v2 PR18 섹션 "validate-draft MAX_REGEN=2 루프" 아래에 아래 샘플 코드 삽입:

```typescript
// validate-draft/index.ts 내부 재생성 루프 샘플 (PR18 구현 참조)
async function regenerateDraft(
  buyerId: string,
  contactId: string,
  failReason: string,
  attempt: number
): Promise<DraftResult> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const url = `${supabaseUrl}/functions/v1/generate-draft`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000); // 45s

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "generate_ko",
        buyer_id: buyerId,
        contact_id: contactId,
        regenerate_context: {
          attempt,
          previous_fail_reason: failReason,
          forbidden_patterns: failReason.split(",").map((s) => s.trim()),
        },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`generate-draft returned ${res.status}`);
    return await res.json();
  } catch (err) {
    clearTimeout(timeout);
    if (attempt >= 2) {
      // MAX_REGEN 도달 → 최종 flag 확정
      return { status: "flag_regen_failed", reason: err instanceof Error ? err.message : String(err) };
    }
    throw err;
  }
}
```

**주의사항**:
- Edge Function 간 호출은 ADR-009 direct fetch 원칙 유지 (supabase.functions.invoke 금지).
- `SERVICE_ROLE_KEY` 또는 `SUPABASE_SERVICE_ROLE_KEY` 둘 다 수용 (현재 코드 관행).
- 45초 timeout은 generate-draft 평균 15~20초 감안 안전 여유.
- `forbidden_patterns`는 generate-draft 프롬프트에 `"이전 시도 스팸 위반: ${forbidden_patterns.join(', ')}. 해당 단어·패턴 회피."`로 주입.

#### v3 추가 2 — generate-draft 프롬프트 PR17 실측 규칙 재확인

PR17에서 이미 적용한 규칙(150단어 / 금지 오프닝 / 설교 금지 / 회사 소개 1줄 / Korea 필수 / Hi firstName)이 `generate_ko` + `translate_save` 둘 다에 적용돼 있는지 PR18 첫 단계에 재검증 SQL:

```sql
-- PR18 착수 직전 확인: 최근 초안 5건이 150단어 이내 + Korea 포함 + Hi 시작인지
SELECT id, buyer_id,
  array_length(regexp_split_to_array(body_en, E'\\s+'), 1) AS word_count,
  (body_en ~* '\y(korea|korean|k-?beauty|made in korea)\y')::int AS has_korea,
  (body_en ILIKE 'Hi %')::int AS hi_greeting
FROM email_drafts
WHERE created_at > now() - interval '1 day' AND is_sent = false
ORDER BY created_at DESC LIMIT 5;
-- 기대: word_count <= 150 AND has_korea = 1 AND hi_greeting = 1 모두.
```

#### 나머지 PR18 본문 (v2 그대로)

- validate-draft MAX_REGEN=2 루프 (위 샘플 코드로 구현)
- 재시도 프롬프트에 위반 사유 주입
- generate-draft BODY FORMAT (3~4문단 빈 줄 2칸) + K-Beauty 1~2회
- `normalizeParagraphs` 후처리 유틸
- 재생성 후 Teddy 눈검수 의무 배너
- Teddy 검증 3세트

- **DB migration**: 불필요.
- **Edge Function 재배포**: `generate-draft` + `validate-draft` **필요**.
- **예상 공수**: 1일.
- **의존성**: PR17 완료.

---

### PR19 — 팔로업 회차 로직 + 수기 1문장 hybrid 슬롯 (목)

v2 PR19 그대로. 변경 없음.

---

### PR21-Docs — 에이전트별 스펙 md 6개 (금)

v2 PR21-Docs 그대로. 단 `docs/agents/agent_d.md`·`agent_e.md`에 **v3 실측 7개 규칙**과 **SPAM_WORDS 50** 기재 의무.

---

### PR22-Lite — ICP 필터 스킵 사유 UI + SQL 템플릿 (금 오후)

v2 그대로.

---

### (토 4/25) 실전 1차 5~10통 발송

v2 계승 + **v3 재시험 의무 추가**:
- 토 오전 외부 5~10통 발송 **직전**, Teddy 자기 앞 2~3통 재발송 → Primary 판정 재측정.
- 2/3 이상 Primary 아니면 외부 발송 **연기**. PR17/PR18 재튜닝.

---

## 4. 리스크

### 4-1. PR별 리스크 (v2 13건 + v3 추가 3건)

| PR | 리스크 | 완화책 |
|----|--------|--------|
| (v2 13건 계승) | (v2 계승) | (v2 계승) |
| PR17 | 150단어 상한이 인텔 기반 초개인화 본문을 자르는 부작용 | 인텔 스니펫 우선순위: 바이어 고유명사 > SPS 설명. 자르기 필요 시 SPS 설명 1줄 유지하고 일반 설명 먼저 삭제. |
| PR17 | Korea 강제 삽입이 어색 문장 유발 | 프롬프트에 "자연 삽입" + "과시형 금지" + 예시 3개. 재생성 1회 허용. |
| PR18 | validate-draft → generate-draft fetch 순환 호출 타임아웃 | 45s abort controller + MAX_REGEN=2로 최대 90초. Edge timeout 400초 여유. |

### 4-2. 비즈니스 (v2 계승)

### 4-3. 기술 함정 (v2 계승 + v3 추가 1)

4. **validate-draft → generate-draft 순환 호출**
   - 두 Edge Function 간 직접 fetch. 한 쪽 배포 실패 시 다른 쪽도 간접 영향.
   - 배포 순서: generate-draft 먼저 배포 → 1회 smoke test → validate-draft 배포 → smoke test.
   - 롤백: validate-draft 롤백 선행 → generate-draft 롤백. 순서 역전 시 재생성 루프 미동작 상태 장기화.

---

## 5. 대안 (v2 계승)

### 5-4. v3 추가: Korea 키워드 강제 완화 옵션
- 강제 규칙이 3회 재생성에도 자연 문장 생성 실패 시, validate-draft가 flag 대신 warning으로 다운그레이드하고 Teddy 수동 확인. 배송 차단은 아님. (MVP에서는 flag로 시작, 2주 실측 후 warning 전환 검토.)

---

## 6. 체크리스트 통과 여부

- [x] **목표 명확?** — 50통 + 1주일 관찰 + 5/7 중간 체크 + 5/10 최종.
- [x] **더 단순한 방법?** — 5-3에 4건 + 5-4 완화 옵션.
- [x] **리스크 식별?** — PR별 16건 + 비즈니스 4건 + 기술 함정 4건.
- [x] **유지보수?** — PR21-Docs + 비개발자 SQL 3세트.
- [x] **각 단계 검증 가능?** — 복붙 SQL + regression 테스트 + 재시험 2~3통.

---

## 7. 이번 주 + 다음 주 + 판정 주 일정 (v2 단회 → v3 50통 누적 + 1주일)

| 기간 | 날짜 | 활동 |
|------|------|------|
| **1주차 (구현 + 1차 발송)** | 월 4/20 오전 | PR0 완료 (Primary 4/5 확인) |
| | 월 4/20 오후 | PR16 이월 버그 + 배포 승인 |
| | 화 4/21 | PR17 (v3 실측 7개 규칙 + 국문 루브릭 3건 포함) |
| | 수 4/22 | PR18 (v3 fetch 샘플 코드 적용) |
| | 목 4/23 | PR19 팔로업 회차 |
| | 금 4/24 | PR21-Docs + PR22-Lite |
| | **토 4/25** | 자기 앞 2~3통 재시험 → Primary 통과 확인 → 외부 1차 5~10통 발송 |
| | 일 4/26 | 관찰 + 1차 루브릭 집계 |
| **2주차 (누적 발송)** | 월 4/27 ~ 일 5/3 | 매일 5~10통 추가 발송 → 5/3 전 **50통 누적** |
| **3주차 (관찰)** | 월 5/4 ~ 일 5/10 | 회신 관찰. 루브릭 ③+ 집계. |
| **중간 체크** | **목 5/7** | ③+ 0건이면 조기 폐기 검토 (매몰비용 방지) |
| **최종 판정** | **일 5/10** | ③+ 회신 건수로 유지/폐기 결정 |
| **Sprint05** | 5/11~ | PR20 on-demand 재설계 + PR21-Code Deno 모듈 점진 분리 |

### 7-1. 배포 승인 체크포인트 (v2 계승)
각 PR 배포 전 Teddy 명시 승인:
- `npx tsc --noEmit` 통과 스크린샷
- Vercel preview URL
- Supabase migration 사전 점검 SQL 결과
- 프롬프트 수정 시 Supabase preview branch dry-run 1회 → prod 배포

### 7-2. Primary 재측정 의무 (v3 신규)
- **토 1차 외부 발송 직전**: 자기 앞 2~3통 시험 발송 → 2/3 이상 Primary 확인. 미달 시 외부 발송 연기.
- **50통 누적 중 매주 월요일**: 1~2통 자기 앞 샘플링으로 Primary 회귀 확인.

---

## 8. 필요 도구 / 파일 (v2 계승 + v3 추가)

### 8-1. MCP / 도구 (v2 계승)

### 8-2. 신규/갱신 md (v2 계승 + ADR 추가)
- `sprints/Sprint04_Plan_v3.md` (본 문서)
- `docs/DECISIONS.md` ADR 추가:
  - ADR-036 ~ ADR-042 (v2 계승)
  - **ADR-043: 실측 스팸 메일 역추적 — MAX_WORDS=150 / 금지 오프닝 6개 / 설교 문단 금지 / 회사 소개 1줄 인용 / Hi firstName 인사말 / Korea 강제 / SPAM_WORDS 35→50**

### 8-3. 삭제 후보 (v2 계승)

---

## 9. 플랫폼 존재 가치 검증 (v2 구조 계승, 임계일만 갱신)

### 9-1. 회신 가능성 평가 (v2 계승)

### 9-2. 폐기 판단 2중 트리거 (v2 골격 + v3 임계일/체크포인트 갱신)

**임계일**: 2026-05-10 (일) — 50통 누적 + 1주일 회신 관찰 종료 시점.

**2중 트리거 — 둘 중 하나라도 충족 시 폐기 프로세스 개시**:
- **① 수신자 행동 신호 0**:
  - `click_events` 클릭 0건 + Pipedrive BCC 회신 유입 0건 (50통 기준)
- **② 회신 질 루브릭 ③~⑤ 0건**:
  - ①②(자동응답 + 1줄 거절)만 나오고 ③(중립 수신확인) 이상 0건

**중간 체크포인트**:
- **2026-04-26 (일)**: 토 1차 5~10통 후 BCC + click_events + Gmail 확인. ③+ 1건 이상 + 구체 참조 + 후속 질문 → **유지**. 0건 → 2주차 발송하면서 5-1 대안 워크플로 병행 검토.
- **2026-05-07 (목)**: 30~40통 시점. ③+ 0건이면 **조기 폐기 검토** (매몰비용 방지). 5/10 까지 추가 10~20통 발송 계속해도 반전 가능성 낮음.

### 9-3. Teddy가 지금 결정할 것 (v3 갱신)
1. **PR0 Primary 4/5 결과 기반 PR16 착수 승인** (월 오후).
2. **PR17 v3 실측 7개 규칙 + 국문 루브릭 3건 승인** (화 착수 직전).
3. **PR18 validate-draft → generate-draft fetch 샘플 코드 승인** (수 착수 직전).
4. **토 외부 발송 전 자기 앞 재시험 2/3 Primary 통과 승인 필수**.
5. **폐기 판단 임계일 2026-05-10 + 중간 체크포인트 5/7 확정**.
6. **2주차 매일 5~10통 발송 경로** (Teddy 수동 발송 가능 여부 / 자동 스케줄 필요 여부).

---

## 10. 조사 중 발견한 load-bearing 사실 (v2 계승 + v3 추가)

### v3 추가 (실측 데이터)
- **2026-04-20 월 오전 Teddy 자기 앞 5통 테스트 발송**: Primary 4/5, Spam 1/5.
- **스팸 간 1통 원문 보유**: Trinny London 대상 메일. 230+ 단어, AI 오프닝, 설교 문단, 자기 PR 문단, Korea 0건, P.S. 단독 URL — 7개 트리거 모두 동시 발현.
- **DMARC 리포트 실측**: SPF Pass 100%, DKIM Pass 100%, Aligned. 인증 측 완벽.
- **Blacklisted IP**: 209.85.208.47 (Google 공유 IP, 개인 해결 불가, 영향 0.76%).
- **SPAM_WORDS 실제 확인**: `run-pipeline/index.ts` L781-L793 + `validate-draft/index.ts` L28-L38 각각 35개. 신규 15개와 중복 없음 → 최종 50개.
- **validate-draft 현재 구조**: `checkSpamRules` L800-L823 (run-pipeline)·L45-L63 (validate-draft) 5개 룰. v3에서 Korea 누락 + 150단어 초과 2개 룰 신설.

### v2 계승 (그대로)
- MailQueue `fetchFollowups` 합침 버그 근본 원인
- Pipeline `isIcpTitle` 이미 구현
- send-email From 헤더 이미 Teddy Shin 교정됨
- generate-draft tracking_token 폴백 spscos.com
- run-pipeline L495-L499는 합격 블록 (race condition fix 위치)
- fetchPerplexitySearch L55-L97 (401 분기 신규)
- generate-draft translate_save sign-off 지시문 전혀 없음 (PR17 신규 추가)

---

## Critical Files (v2 계승)

- [supabase/functions/run-pipeline/index.ts](../supabase/functions/run-pipeline/index.ts) — B~F 1259줄, SPAM_WORDS L781
- [supabase/functions/generate-draft/index.ts](../supabase/functions/generate-draft/index.ts) — 모달 국문→영문, v3 실측 규칙 반영
- [supabase/functions/validate-draft/index.ts](../supabase/functions/validate-draft/index.ts) — 스팸 재검증, v3 Korea/150단어 룰 + MAX_REGEN=2 fetch
- [app/components/EmailComposeModal.tsx](../app/components/EmailComposeModal.tsx) — 모달 UI
- [app/components/MailQueue.tsx](../app/components/MailQueue.tsx) — 팔로업/초안 큐
- [app/components/Pipeline.tsx](../app/components/Pipeline.tsx) — ICP 필터 스킵 사유 UI
- [app/components/Emails.tsx](../app/components/Emails.tsx) — 폴백 필터
- `memory/reference_sps_infra.md` — Claude 세션 중복 체크 SQL 병기
