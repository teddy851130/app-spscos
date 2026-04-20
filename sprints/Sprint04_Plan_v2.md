# Sprint04 수정 계획 v2 — 바이어 회신율 확보

> 2026-04-20 작성. Generator/Evaluator 루프 2회차. v1(84/100)의 Evaluator 리뷰(치명 gap 4건 + 중요 gap 8건 + 구체 지시 10개)를 반영. 목표 93~97점.

## v1 대비 핵심 변경 요약

1. **PR0 신설** — 발송 인프라(Primary 탭/DMARC/SPF/DKIM) 사전 점검. Promotions 탭 떨어지면 PR16~19 의미 없음.
2. **PR 순서 재조정** — PR20(파이프라인 재설계) + PR21(코드 분리) **Sprint05로 이월**. 이번 주는 실전 발송이 **기존 파이프라인 위**에서 이뤄져야 원인 변수 최소화.
3. **회신율 KPI 이중화** — 5~10통 단계는 "정성 조건(자동응답 제외 + 본문 구체 참조 + 후속 질문)" 1건, 수치 회신율은 20~50통 축적 후에만 평가.
4. **AI 냄새 완화 시스템 추가** — PR17에 눈검수 체크포인트, PR19에 Teddy 수기 1문장 hybrid 슬롯.
5. **팔로업 참조 규칙 세분화** — 허용 3 / 금지 2 명문화. breakup 회신율 16~33%는 SaaS 기준이며 OEM 시장 실측 유일 검증.

---

## 1. 목표

### 1-1. 정성 목표
해외 바이어가 "다른 콜드메일 100통 속에서 이 한 통만은 읽어보고 1줄이라도 회신"하게 만드는 조건 — **담당자 본인 이름으로만 불리고, 한국 기업 정체성이 드러나며, 본문이 스팸/덩어리가 아닌 초개인화 메시지** — 를 성립시키는 것. **회신**이 KPI. UX 버그 4건(담당자 합침·서명 오류·포맷 덩어리·추적 링크 404) 해결로 회신율이 반등하지 않으면 플랫폼 폐기.

### 1-2. 정량 성공 기준 — 이중화 (Evaluator 치명 gap 1 반영)

#### 1차 기준 (이번 주 말, 5~10통 단계) — 정성 조건
5~10통 샘플에서 **회신율 수치 측정은 통계적으로 불가**(5통 × 3% = 0.15통). 따라서 1통도 "회신율 3%를 증명"하지 못함. 이 단계는 **회신의 질**로만 판정.

**회신 질 5단계 루브릭**:
| 등급 | 설명 | 유지 판단 기여도 |
|------|------|------|
| ① 자동 응답 / OOO | Out-of-office, 샘플 요청서 자동 응답 | 0 (수신자 미인지) |
| ② 1줄 거절 | "관심 없습니다", 언스크라이브 | 0.2 (본문은 읽음) |
| ③ 중립 수신 확인 | "전달하겠습니다", "검토 후 연락" | 0.5 (약한 신호) |
| ④ 구체 질문 | MOQ·카테고리·기간 등 질문 | 1.0 |
| ⑤ MTG / 샘플 요청 | 미팅 or 샘플 요청 | 1.5 |

**1차 통과 조건**: ③ 이상 1건 이상 + 본문에 바이어/제품 **구체 고유명사 참조 존재** + 후속 질문 or 다음 단계 언급. ①②만 나오면 통과 아님.

#### 2차 기준 (2주 후, 20~50통 축적 후) — 수치
- 20~50통 축적 시점(목표 2026-05-04 월)에만 회신율·오픈율 수치 평가.
- "업계 평균 1~2%" / "breakup 메일 16~33%" 벤치마크는 **SaaS/B2B 일반 값**이고 **화장품 OEM GCC/USA/Europe 시장 실측 값 불명**. 실측이 유일 검증 — 벤치마크 숫자는 참고만.

#### 파이프라인 안정성
- race condition 없이 10명 발송 성공 (drafts 중복 0건, status 모순 0건).

#### 비개발자 셀프 운영
- 각 PR에 Teddy 복붙 SQL + 기대 결과 숫자 + 불일치 시 대응 3세트.

### 1-3. 비(非)목표
- 완전 자동 파이프라인 / 배포 자동화.
- UI 리디자인.
- 통합 웹사이트(spscos.com) 구축. 추적 URL은 spscos.com 루트 폴백 대기.

---

## 2. 접근 방식 & 근거

### 2-1. 우선순위 원칙
회신율 영향 = **수신자가 본문을 연 첫 5초의 인상** + **본문이 Primary 탭에 도달**. 4그룹:

- **Group 0 (BLOCKER, 월 오전)** — 발송 인프라가 망가졌으면 PR16~19 전부 무효.
  - PR0: Primary 탭 판정 + DMARC/SPF/DKIM 현황 DNS 조회
- **Group 1 (CRITICAL, 월 오후 ~ 화)** — 발송 메일의 파괴적 결함.
  - PR16: 파이프라인 이월 버그 4건
  - PR17: 담당자 분리 + Teddy Shin 서명 + spscos.com 본문 삽입 + AI 냄새 눈검수
- **Group 2 (HIGH, 수~목)** — 본문 품질 결함.
  - PR18: 스팸 자동 재생성 + 본문 포맷 + K-Beauty 워딩
  - PR19: 팔로업 회차 로직 + 수기 1문장 hybrid 슬롯
- **Group 3 (LOW, 금~주말)** — 문서 + 실전 발송.
  - PR21-Docs: docs/agents/agent_{a~f}.md 6개 (코드 분리는 Sprint05 이월)
  - PR22-Lite: ICP 필터 스킵 사유 UI 노출 + SQL 템플릿 1개 (0.5일)
  - 실전 5~10통 발송

**PR20(파이프라인 D/E on-demand 재설계) + PR21 코드 분리는 Sprint05로 이월** (Evaluator 중요 gap 4+8).

### 2-2. 묶음 근거
- **PR17 우선**: Teddy 제기 12건 중 #2·#5·#6이 한 바이어 1회 열람에서 동시 노출. 따로 PR하면 배포 3회.
- **PR18 3건 묶음**: `generate-draft` 프롬프트 + 후처리 유틸 1파일 → 충돌 최소.
- **PR20·PR21 이월 근거**: 실전 5~10통 발송이 **현재 파이프라인 위**에서 이뤄져야 회신 0일 때 "파이프라인 재설계 vs 본문 품질" 원인 분리 가능. 재설계를 먼저 하면 변수 2개.

### 2-3. 비파괴 원칙
- 각 PR 독립 롤백. 특히 Edge Function 배포 실패 대비 **이전 버전 복원 경로**(Dashboard → Functions → Deployments) 각 PR에 명시.
- prod 배포는 매번 Teddy 명시 승인 후.

---

## 3. 단계별 실행 (PR 단위)

### PR0 — 발송 인프라 점검 (월 오전, Teddy 수동 5분)

**Evaluator 치명 gap 3 반영. Promotions 탭 떨어지면 PR16~19 무효.**

- **목표**: 현재 Gmail 발송이 Primary 도달하는지, DMARC/SPF/DKIM 정렬되는지 확인.
- **배경**: `project_sps_dmarc.md` 메모리 — 2026-04-19 EasyDMARC 연결, 2주 후 quarantine → 2~3개월 후 reject 계획. 현재 `p=none` 단계.

**Teddy 수동 체크리스트 (5분)**:

1. **자기 앞 5통 테스트 발송** (1~2분):
   - app.spscos.com 에서 `teddy.co.kr@gmail.com`(Teddy 개인 Gmail)로 **다른 바이어 5명 이름**의 미발송 초안을 선택해 실전 UI 그대로 발송.
   - 또는 신규 `buyer_contacts` 5건(자신 이메일로) 임시 생성 → 직원 D/E 자동 초안 → 발송.
   - **체크**: 5통 중 몇 통이 **Primary 탭 / Promotions 탭 / Spam** 에 도달?
   - **판정**:
     - Primary 5/5 → PR16~19 진행 OK
     - Primary 3~4/5 → PR16~19 진행하되 PR18 K-Beauty 워딩 밀도 낮추기 검토
     - Primary ≤2/5 → **STOP**. PR16~19 의미 없음. 인프라 근본 문제 먼저.

2. **DMARC/SPF/DKIM DNS 조회** (1분):
   - 온라인 툴 https://mxtoolbox.com/DMARC.aspx 에서 도메인 `spscos.com` 조회.
   - 또는 Windows PowerShell:
     ```powershell
     nslookup -type=TXT _dmarc.spscos.com
     nslookup -type=TXT spscos.com
     nslookup -type=TXT default._domainkey.spscos.com
     ```
   - **기대**:
     - `_dmarc.spscos.com` → `v=DMARC1; p=none; rua=mailto:...` (현재 정책 none)
     - `spscos.com` TXT → SPF 레코드 `v=spf1 include:_spf.google.com ~all`
     - `default._domainkey.spscos.com` → DKIM 공개키 (Gmail Workspace 설정)
   - **불일치 시**: EasyDMARC 리포트 확인 → SPF/DKIM 정렬 실패 원인 파악 후 PR16 착수 보류.

3. **EasyDMARC 최근 7일 리포트** (1분):
   - https://app.easydmarc.com/ 로그인 → `spscos.com` dashboard.
   - **체크**: Fully Aligned %, Partially Aligned %, Failed %. Failed가 30%+면 PR0 내 트러블슈팅 우선.

- **Teddy 승인 포인트**: Primary 판정 결과 스크린샷 + DNS 조회 결과를 세션에 공유. **Primary ≤2/5인 경우 스프린트 재조정** (PR16~19 유예).
- **예상 공수**: Teddy 수동 5분.
- **의존성**: 없음. 최우선.

---

### PR16 — 파이프라인 이월 버그 4건 일괄 fix (월 오후)

- **목표**: Perplexity 401/402 분리 로그, intel_failed race condition 제거, agentD/E team 필터, Emails.tsx 폴백 정상화.

- **수정 파일 — 실제 line 재교정** (Evaluator 사실 검증 반영):

  - [supabase/functions/run-pipeline/index.ts](supabase/functions/run-pipeline/index.ts):
    - **`fetchPerplexitySearch` L55~L97 내부 401 분기 신규 추가**: 현재 L66-L67에 402만 있고, L69 `!res.ok`로 401이 묻혀 에러 메시지가 모호함. 추가:
      ```ts
      if (res.status === 401) {
        return { ok: false, creditExhausted: false, authFailed: true,
                 error: "Perplexity API 키 인증 실패 (HTTP 401) — https://www.perplexity.ai/settings/api 에서 키 재확인" };
      }
      ```
      `PplxResponse` 타입에 `authFailed?: boolean` 추가.
    - **`callPerplexityForBuyer` L342-L368 분기 확장**: L354 `result.creditExhausted` 가지 위에 `result.authFailed` 가지 추가 — 402와 동일하게 `perplexityCreditExhausted=true`로 이후 바이어 전체 폴백 + "401=키 무효" 명시 로그.
    - **L495-L499 합격 블록에 `status: 'Cold'` 명시 추가** (race condition fix): race 뒤늦게 성공한 경우 `intel_failed` 잔류 방지.
      ```ts
      await sb.from("buyers")
        .update({ recent_news: finalJson, intel_score: score, status: 'Cold', analysis_failed_at: null })
        .eq("id", b.id);
      ```
    - **agentD L538 `async function agentD(sb, jobId, _team)`** → `_team` 언더스코어 제거 → 실사용. `buyer_contacts` SELECT에 `buyers!inner(region)` join + `.eq('buyers.region', team)` 조건 추가.
    - **agentE L867** 동일 패턴.

  - [app/components/Emails.tsx](app/components/Emails.tsx) L50-L75 폴백 필터:
    - 변경: 허용 목록 `['Contacted','Replied','Sample','Deal','Lost','Bounced']`만.
    - 단순 대안(권장): 폴백 자체 제거 → email_logs 직결.

- **DB migration — 백업 + 롤백 + 정밀 조건** (Evaluator 중요 gap 7):

  ```sql
  -- ① 기대 건수 사전 측정
  SELECT count(*) AS will_recover
  FROM buyers
  WHERE status = 'intel_failed'
    AND intel_score >= 60
    AND recent_news IS NOT NULL
    AND analysis_failed_at IS NOT NULL;
  -- 기대: 0~수십 건. 수백+ 면 중단하고 원인 조사.

  -- ② 백업 (영향받을 row만 임시 테이블에 스냅샷)
  CREATE TABLE buyers_intel_recovery_20260420 AS
  SELECT id, status, intel_score, analysis_failed_at, recent_news, updated_at
  FROM buyers
  WHERE status = 'intel_failed'
    AND intel_score >= 60
    AND recent_news IS NOT NULL
    AND analysis_failed_at IS NOT NULL;

  -- ③ 실행
  UPDATE buyers
  SET status = 'Cold',
      analysis_failed_at = NULL
  WHERE status = 'intel_failed'
    AND intel_score >= 60
    AND recent_news IS NOT NULL
    AND analysis_failed_at IS NOT NULL;

  -- ④ 검증
  SELECT count(*) AS remaining_intel_failed
  FROM buyers WHERE status = 'intel_failed';
  -- 기대: ①에서 측정한 will_recover 만큼 줄어야 함.

  -- ⑤ 롤백 (문제 생기면)
  UPDATE buyers b
  SET status = bak.status, analysis_failed_at = bak.analysis_failed_at
  FROM buyers_intel_recovery_20260420 bak
  WHERE b.id = bak.id;
  ```

- **Edge Function 재배포**: `run-pipeline` **필요**.
- **Teddy 검증** (복붙 3세트):
  1. **①번 쿼리** → 결과 숫자(will_recover) 스크린샷. 0이면 PR16 없이 바로 PR17.
  2. **3팀 동시 파이프라인 1회 실행** → `pipeline_logs` WHERE stage='C' AND status='running' AND message ~ 'Perplexity'. 기대: 401이면 "키 무효" 메시지, 402면 "크레딧 부족".
  3. **agentD team 필터 확인** SQL:
     ```sql
     SELECT p.job_id, p.stage, p.message FROM pipeline_logs p
     WHERE p.created_at > now() - interval '1 hour' AND p.stage IN ('D','E')
     ORDER BY p.created_at DESC LIMIT 20;
     ```
     기대: team=GCC 실행 시 GCC 바이어만 처리. USA/Europe 건수가 0이어야 함.
  4. Emails 페이지 상태가 email_logs와 일치.
- **예상 공수**: 4h.
- **의존성**: PR0 Primary 판정 통과.

---

### PR17 — 담당자 분리 + Teddy Shin 서명 + spscos.com 본문 삽입 + AI 냄새 눈검수 (화)

- **목표**: MailQueue 합침 버그 근본 해결 + 서명 풀네임 + 추적 URL 본문 중간 자연 삽입 + AI 냄새 1차 점검.

- **근본 원인 (v1 조사 재확인, 그대로 유지)**:
  - 합침 원인은 D/E 프롬프트가 아니라 [MailQueue.tsx](app/components/MailQueue.tsx) **L162-L220 `fetchFollowups`가 `buyers` 테이블 단일 조회**. `buyers.contact_name` 레거시 콤마조인 값("Helen L, Cristina D, Carol N")이 단일 문자열로 상속 → EmailComposeModal에 그대로 전달 → 인사말 합침.

- **수정 파일 — 서명 수정 체크박스 3개로 분리** (Evaluator 구체 지시 8):

  #### (a) EmailComposeModal.tsx UI 텍스트 교정
  - L718 `Donghwan Shin` → `Teddy Shin`.

  #### (b) agentD 프롬프트 SIGN-OFF 풀네임화
  - [run-pipeline/index.ts](supabase/functions/run-pipeline/index.ts):
    - **L660** `(5) SIGN-OFF — "Warm regards," on one line, "Teddy" on the next line.` → `"Teddy Shin"`.
    - **L662 P.S. 지시문도 수정 대상 (v1 누락)**: `"P.S. A 3-minute preview of what we do, if helpful: ${trackingUrl}"` → **P.S. 제거, 본문 3~4문단 끝에 자연 삽입** `"You can see a short overview of what we do at https://spscos.com/ whenever convenient."`. trackingUrl은 기존 tracking_token 폴백 로직(generate-draft L93-L109)이 `spscos.com/`으로 대체 중이므로 그대로 유지.
    - **L685 body_first description** 내 `"(5) 'Teddy' sign-off on its own line"` → `"'Teddy Shin'"`, `"(6) 'P.S. A 3-minute preview of what we do: ${trackingUrl}'"` 제거 → body_first 본문 자연 삽입 지시로 재작성.
    - **L686 body_followup `Sign off 'Teddy'`** → `Sign off 'Teddy Shin'`.

  #### (c) translate_save 프롬프트 sign-off 지시문 **신규 추가**
  - [generate-draft/index.ts](supabase/functions/generate-draft/index.ts):
    - **L224-L246 translate_save 프롬프트에 현재 sign-off 지시문이 아예 없음** (확인됨). 신규 추가 위치: L236 `Context: Sender is Teddy Shin, CEO of SPS Cosmetics (spscos.com). MOQ is 3,000 units.` 직후 단락:
      ```
      SIGN-OFF RULE:
      - The email MUST end with a two-line sign-off: "Warm regards,\nTeddy Shin".
      - If the Korean body ends with "드림" or "감사합니다 — Teddy", translate this to "Warm regards, Teddy Shin" on two lines.
      - Never output just "Teddy" alone — always "Teddy Shin".
      ```
    - L156 국문 "Teddy 드림" 유지.

  #### MailQueue.tsx `fetchFollowups` 전면 재작성 (합침 버그 근본 해결)
  - L162-L220 `buyer_contacts` JOIN으로 담당자별 row 분리:
    ```ts
    .from('buyer_contacts')
    .select(`
      id, contact_name, contact_email, contact_title, contact_status, buyer_id,
      buyers!inner(id, company_name, tier, region, status, last_sent_at, next_followup_at, email_count)
    `)
    .not('buyers.next_followup_at', 'is', null)
    .lte('buyers.next_followup_at', todayEndUtc)
    .not('buyers.status', 'in', `(${excludeStatuses.join(',')})`)
    ```
  - L270 `handleEmailClick`에서 `contact_id: bc.id` 확실히 전달.
  - **L295-L298 `uniqueBuyerIds` 카운트 의미 재정의** (Evaluator 기술 함정 3):
    - 현재: `followups.forEach(f => uniqueBuyerIds.add(f.id))` — `f.id`가 buyer.id였음.
    - PR17 후: `f`가 buyer_contacts row라 `f.id`는 contact.id. buyer 단위 count를 원하면 `f.buyer_id` 사용해야 함.
    - **결정**: `totalCount`의 의미를 **"오늘 작성해야 할 메일 수"**(contact 단위)로 재정의. 기존 "버이어 수" 해석 폐기.
    ```ts
    const uniqueContactIds = new Set<string>();
    followups.forEach((f) => uniqueContactIds.add(f.id));           // contact_id
    drafts.forEach((d) => uniqueContactIds.add(d.buyer_contact_id)); // contact_id
    const totalCount = uniqueContactIds.size;
    ```
    UI 헤더 문구 `오늘 보낼 메일 ({totalCount}건)` → **문구 그대로 OK** (원래도 "메일" 단위 해석이 자연스러움).

- **AI 냄새 눈검수 체크포인트 (신규, Evaluator 치명 gap 2)**:
  - PR17 배포 후 `generate_ko`로 5개 바이어 초안 생성 → Teddy가 **1~5점 채점** (1=명백한 AI, 5=사람이 쓴 것 같음).
  - **채점 루브릭**:
    - -1점: "I hope this email finds you well" / "just wanted to reach out" / "I wanted to touch base" 류 진부 도입
    - -1점: 과도한 형용사 (remarkable, incredible, outstanding 3회+)
    - -1점: 빈 약속 ("transform your business", "unlock potential")
    - -1점: 첫 문장이 40단어+ 긴 문장
    - -1점: 문단 간 연결이 템플릿틱 ("Furthermore", "Additionally" 반복)
  - **3점 미만 2개 이상** → PR17 재수정(프롬프트 튜닝). 3점 이상 3~5개 → PR18 진입.

- **DB migration**: 불필요.
- **Edge Function 재배포**: `generate-draft` + `run-pipeline` **필요**.

- **Teddy 검증** (복붙 4세트):
  1. **Rara Beauty 3명 regression 테스트 2케이스** (Evaluator 중요 gap 1):
     - **케이스 A (3명 모두 미발송)**: MailQueue → 각 담당자별 행 3개 노출. `totalCount` 3증가. 각 행 클릭 시 모달 인사말 `Dear Helen L,` / `Dear Cristina D,` / `Dear Carol N,` 로 분리.
     - **케이스 B (Helen·Cristina 이미 발송, Carol만 미발송)**: MailQueue에 Carol 행 1개만. `totalCount` 1증가. 기발송자는 팔로업 큐(email_count=1)로 표시.
  2. **영문 sign-off 확인**: 모달 "영문으로 번역·저장" → UI에 `Warm regards,` 줄 + `Teddy Shin` 단독 줄 표시.
  3. **본문 URL 위치**: body_first 중간에 `https://spscos.com/` 등장 1회, `P.S.` 섹션 없음. agentD 자동 초안도 동일.
  4. **AI 냄새 채점**: 생성본 5개 Teddy 1~5점. 평균 3점 이상이면 통과.
- **예상 공수**: 1일.
- **의존성**: PR16 완료.

---

### PR18 — 스팸 자동 재생성 + 본문 포맷 + K-Beauty 워딩 (수)

- **목표**: flag 판정 시 자동 재생성 루프, 본문 단락 분리 강제, K-Beauty 정체성 삽입.

- **수정 파일**:

  #### validate-draft MAX_REGEN=2 루프 (Evaluator 사실 검증 "재생성 경로" 반영)
  - [supabase/functions/validate-draft/index.ts](supabase/functions/validate-draft/index.ts):
    - 현재 구조: L141 `checkSpamRules` → L151 규칙 통과 시 Claude 점수 → L226 규칙 위반 시 `autoFixSpam` 1회. 재생성 루프 **없음**.
    - 변경: spam_status가 `flag`가 나오면 **`generate-draft` 의 `generate_ko` 액션을 재호출**하여 새 국문 초안 받기 → translate → validate 반복. MAX_REGEN=2.
    - 의존: validate-draft → generate-draft 내부 fetch 호출 (Edge Function 간 통신). `SERVICE_ROLE_KEY` + 동일 SUPABASE_URL 사용. direct fetch(ADR-009) 원칙 유지.
    - **재시도 프롬프트에 위반 사유 주입**: `"이전 시도 스팸 위반 사유: ${issues.join(', ')}. 해당 단어·패턴 회피하여 재작성."`
    - 2회 실패하면 `flag` 최종 반환.

  #### generate-draft 프롬프트 보강
  - [generate-draft/index.ts](supabase/functions/generate-draft/index.ts) L144-L164 국문 프롬프트에 추가:
    ```
    BODY FORMAT (strict):
    - 본문은 빈 줄 2칸으로 구분된 3~4개 문단. 한 문단 = 1~3문장. 덩어리 금지.
    - 본문 어딘가에 K-Beauty / Korea / Made in Korea / Korean OEM 중 **1~2개**를 자연스럽게 삽입 (과시형 금지, 문맥 속 언급 1회).
    - K-Beauty 키워드 삽입 예시: "As a Korean OEM partner, we've seen...", "the K-Beauty export channel has...", "Korea's manufacturing ecosystem...".
    ```
  - translate_save 프롬프트(L224-L246)에도 동일 규칙 추가.
  - agentD 프롬프트(run-pipeline L626-L687) `body_first` description에도 동일 규칙 추가.

  #### 후처리 유틸 `normalizeParagraphs`
  - 신규 `supabase/functions/_shared/normalize.ts` (또는 validate-draft 내부 함수):
    - `\n` 3줄+ → `\n\n` 정규화
    - 문단 400자+ → 마침표 기준 자동 분리
    - DB 저장(`body_first` UPDATE) 직전 호출.

- **비용 시나리오** (Evaluator 중요 gap 2):
  - Haiku 기준 1통 ≈ $0.001. 100통 발송 × 10% flag × 2회 재시도 ≈ $0.02. 리스크 무시 가능.

- **재생성 후 Teddy 눈검수 의무 단계** (Evaluator 중요 gap 2):
  - validate-draft가 `rewrite` 또는 재생성 통과 반환하면 UI에 **"자동 재생성 N회 후 통과 — 확인 요망"** 노란 배너.
  - Teddy가 본문 읽고 AI 냄새 3점 이상 확인 후 발송. 아니면 수동 수정.

- **DB migration**: 불필요.
- **Edge Function 재배포**: `generate-draft` + `validate-draft` **필요**.

- **Teddy 검증** (복붙 3세트):
  1. **스팸 단어 강제 주입 테스트**:
     ```sql
     -- 테스트 draft 생성 후
     UPDATE email_drafts SET body_first = body_first || ' Act now for a free guarantee!'
     WHERE id = '<테스트 draft_id>';
     ```
     → validate-draft 호출 → 기대: `spam_status='pass'` + UI 배너 "자동 재생성 1~2회 후 통과".
  2. **본문 줄바꿈 확인**: Gmail 본인 발송(또는 Teddy 개인 Gmail) → 단락 3~4개, 빈 줄 구분.
  3. **K-Beauty 키워드 카운트 SQL**:
     ```sql
     SELECT id, buyer_id,
       (body_first ILIKE '%K-Beauty%')::int + (body_first ILIKE '%Korea%')::int + (body_first ILIKE '%Made in Korea%')::int AS kb_hits
     FROM email_drafts
     WHERE created_at > now() - interval '1 day' AND is_sent = false
     ORDER BY created_at DESC LIMIT 20;
     ```
     기대: `kb_hits >= 1` AND `kb_hits <= 3` (과시형 방지).
- **예상 공수**: 1일.
- **의존성**: PR17 완료.

---

### PR19 — 팔로업 회차 로직 + 수기 1문장 hybrid 슬롯 (목)

- **목표**: 팔로업 버튼 클릭 시 회차 배지 + 이전 본문 탭 + 회차별 프롬프트 + **Teddy 수기 1문장 옵션**.

- **수정 파일**:

  #### EmailComposeModal 회차 UI
  - [EmailComposeModal.tsx](app/components/EmailComposeModal.tsx):
    - `emailType: initial|followup1|followup2|breakup` prop 또는 `buyer.email_count` 자동 파생.
    - 상단 회차 배지.
    - **"이전 발송 내역" 탭 신규**: `email_logs` WHERE `buyer_id` + `contact_id`, sent_at desc, `body_en / subject / sent_at` 목록.
    - **수기 1문장 삽입 슬롯 (신규, Evaluator 치명 gap 2)**:
      - 텍스트 입력 한 줄 + "이 문장을 본문 2~3문단 사이에 삽입" 체크박스.
      - 체크 시 `generate_ko` 요청 본문에 `manual_sentence: string` 파라미터 전달. 프롬프트 지시: `"사용자가 직접 쓴 문장 '${manual_sentence}'을 본문 2번째와 3번째 문단 사이에 자연 삽입. 다른 문장을 수정하지 말 것."`

  #### generate-draft 회차별 프롬프트 분기
  - `generate_ko` action에 `email_type`, `previous_emails`, `manual_sentence` 파라미터 수용.
  - 분기:
    - `initial`: 기존 CIA.
    - `followup1`: case-study angle — **허용 참조 3** + **금지 2**:
      - 허용: ① 이전에 언급한 바이어 고유명사 1개 ② 이전 ASK 주제(15분 대화 등) ③ 발송 시점 (구체 날짜 금지, "a couple of weeks ago" 허용)
      - 금지: ① 이전 본문 문장 그대로 복붙 ② "지난번 메일 보셨나요?" 식 죄책감 자극
    - `followup2` (breakup): "지금이 적기 아닌 것 같습니다. 때가 되시면 언제든. 이후 연락드리지 않겠습니다." 톤.
    - `breakup` 이후 UI 버튼 비활성화.
  - **breakup 벤치마크 주의**: 업계 평균 16~33%는 **SaaS 기준**이고 **화장품 OEM 실측 값 불명**. 실측이 유일 검증. 벤치마크는 "이 회차 자체가 회신 가능"임을 뒷받침하는 용도일 뿐, 목표 수치 아님.

- **DB 스키마 무변경** — 기존 `body_followup` 단일 필드 재사용.
- **Edge Function 재배포**: `generate-draft` **필요**.

- **Teddy 검증** (복붙 3세트):
  1. `email_count=1` 바이어 → "1차 팔로업" 배지, 이전 발송 내역 탭 1건.
  2. 생성 국문이 1차와 각도 다른지 (case-study). **허용 3 / 금지 2 육안 확인**:
     - 허용: 바이어 고유명사 1개 ✓, 이전 ASK 언급 ✓, "a couple of weeks ago" 표현 ✓
     - 금지: 이전 본문 그대로 인용 ✗, "혹시 제 이전 메일 놓치셨을까요?" ✗
  3. **수기 1문장 hybrid 테스트**: "Saw your IG post about the Dubai expansion — congrats." 입력 + 체크 → 2~3문단 사이에 정확히 삽입 확인.
- **예상 공수**: 1.5일.
- **의존성**: PR18 완료.

---

### PR21-Docs — 에이전트별 스펙 md 6개 (금, 코드 분리 이월)

**Evaluator 중요 gap 8 반영: 1일 공수로 1259줄 Deno Edge Function 분리는 비현실. 이번 주는 문서만.**

- **목표**: `docs/agents/agent_{a,b,c,d,e,f}.md` 6개 신규. 각 에이전트 역할·입출력·환경변수·규칙 명문화. AGENTS.md 인덱스 갱신.
- **수정 파일**:
  - 신규 `docs/agents/agent_a.md` (발굴 + ICP 체크리스트 + Claude 세션 중복 SQL 포함)
  - 신규 `docs/agents/agent_b.md` (ZeroBounce 401/402 분기, 크레딧 사전조회)
  - 신규 `docs/agents/agent_c.md` (Claude+Perplexity, intel_score 공식, threshold 60, 401/402 분기, PR16 race fix)
  - 신규 `docs/agents/agent_d.md` (CIA+Challenger, SPAM_WORDS 35, K-Beauty 규칙, Teddy Shin 서명, spscos.com 본문 삽입)
  - 신규 `docs/agents/agent_e.md` (스팸 5규칙, autoFix, MAX_REGEN=2 + 재생성 경로)
  - 신규 `docs/agents/agent_f.md` (모니터링 + agentF 경고 조건: Perplexity 크레딧 / ZeroBounce 크레딧 / 직원 B/C/D/E 실패)
  - `AGENTS.md` — 현재 6줄 지시 + 각 agent_*.md 인덱스 링크 추가.
- **코드 분리는 Sprint05 이월**:
  - **근거** (Evaluator 기술 함정 1): Deno ESM import는 `https://...` 또는 `./relative` 경로. 1259줄 1회 분리는 배포 1회 실패 = 전체 파이프라인 다운. Sprint05에서 agentB → agentC → agentD → agentE 순차 **파일별 개별 deploy** 필수.
- **DB migration**: 불필요.
- **Edge Function 재배포**: 불필요 (문서만).
- **Teddy 검증**: 6개 md 링크 모두 클릭 가능 + `AGENTS.md`에서 네비게이션 가능.
- **예상 공수**: 0.5일 (6 × 30분 + AGENTS.md 정리).

---

### PR22-Lite — ICP 필터 스킵 사유 UI 노출 + SQL 템플릿 1개 (금 오후, 0.5일)

**Evaluator 중요 gap 5 + 치명 gap 4 반영: 엔드포인트 신설 제거. 이미 구현된 기능의 UX + 세션 고정 템플릿만.**

- **목표**: Pipeline.tsx의 ICP 필터 스킵 사유를 사용자에게 노출 + Claude 세션이 Apollo/Clay 결과 받을 때마다 복붙 실행할 **고정 SQL 템플릿 1개**를 `memory/reference_sps_infra.md`에 병기.

- **수정 파일**:
  - [Pipeline.tsx](app/components/Pipeline.tsx) L208-L219 `isIcpTitle` 필터 skip 사유 UI 노출:
    - `firstError` 리스트 확장: `"Sales Director → buying/procurement 키워드 미포함으로 제외 (N건)"` 식.
    - UI 컴포넌트에 스킵 사유 summary 박스.
  - `memory/reference_sps_infra.md`에 추가:
    ```sql
    -- Claude 세션 바이어 후보 중복 사전 체크 (Apollo/Clay 결과 도메인 배열 받을 때 매번 실행)
    -- 사용법: domains_to_check 에 후보 도메인들 넣고 실행
    WITH candidates AS (
      SELECT unnest(ARRAY[
        'example1.com', 'example2.com', 'example3.com'  -- ← 여기 교체
      ]) AS domain
    )
    SELECT c.domain, b.id AS existing_buyer_id, b.company_name, b.status, b.created_at
    FROM candidates c
    LEFT JOIN buyers b ON b.domain = c.domain OR b.website ILIKE '%' || c.domain || '%'
    ORDER BY c.domain;
    -- existing_buyer_id IS NOT NULL 행 = 중복. 해당 도메인 후보 목록에서 제거 후 CSV 업로드.
    ```
  - `docs/agents/agent_a.md`에 동일 SQL + ICP 체크리스트(Tier1/2 정의 + 직함 키워드 + 지역 + MOQ 3,000)기재.

- **엔드포인트 신설 제거** (v1 `precheck-domains` 폐기): Teddy 비개발자 + Clay/Apollo 웹훅 불가. Claude 세션 수동 SQL이 현실적 운영 경로.

- **DB migration**: 불필요.
- **Edge Function 재배포**: 불필요.
- **Teddy 검증** (복붙 2세트):
  1. Sales Director 혼입 CSV 업로드 → Pipeline 화면에 "ICP 직함 미달 N건 제외" 표시.
  2. `reference_sps_infra.md` SQL 복붙 실행 → 기존 도메인 후보 N건 검출.
- **예상 공수**: 0.5일.
- **의존성**: PR21-Docs 완료 후 (agent_a.md 일관성).

---

### (토 4/25) 실전 5~10통 발송 — 파이프라인 무변경 검증

**Evaluator 중요 gap 4+6 반영: PR20/PR21 이월하여 현재 파이프라인 그대로 위에서 실전 발송. 원인 변수 최소화.**

- **수신자 선정** (Evaluator 구체 지시 9):
  - **신규 CSV 업로드 5명** — 기존 미회신 lead 재발송 아님 (2회차 편향 제거).
  - 조건: GCC/USA/Europe 중 2지역 혼합, Tier1 3명 + Tier2 2명, ICP 직함 통과, 도메인 중복 없음.
- **발송 경로**:
  1. 금 저녁까지 CSV 업로드 → B·C 자동 실행 → intel_score 60+ 합격 5명 확보.
  2. 토 오전 MailQueue에서 바이어별 5명 초안 생성 → Teddy AI 냄새 채점 3점 이상.
  3. 토 오후 발송 (Gmail 일일 500통 한계 여유).
- **모니터링**:
  - Pipedrive BCC 유입 확인.
  - `click_events` 테이블 클릭 이벤트 (tracking_token 있으면 spscos.com 폴백이어도 이벤트 수집됨).
  - Gmail 회신 직접 확인.

---

## 4. 리스크

### 4-1. PR별

| PR | 리스크 | 완화책 |
|----|--------|--------|
| PR0 | Primary ≤2/5 나오면 스프린트 전체 일정 재조정 | PR0 판정을 월 오전에 배치. 재조정 시 PR16~19 1주 유예 + DMARC 리포트 우선. |
| PR16 | race fix가 새 race 유발 | advisory lock 대신 status overwrite만. 백업 테이블 유지로 롤백 1분. |
| PR16 | Perplexity 401 분기 추가 후 기존 402 흐름 깨짐 | fetchPerplexitySearch 단위 콘솔 dry-run 1회 (잘못된 키로 호출하여 401 반환 확인). |
| PR17 | MailQueue 재작성 → 큐 비어 보이는 regression | Evaluator 지적 2케이스 regression 테스트 필수 (Rara Beauty 3/0, 2/1). |
| PR17 | uniqueBuyerIds → uniqueContactIds 전환으로 카운트 체감 증가 | UI 헤더 "오늘 보낼 메일 N건"은 메일 단위가 자연스러움. 변경 불필요. |
| PR17 | AI 냄새 채점 2점대 반복 | 프롬프트 튜닝 라운드 2회 한도. 초과 시 PR18 병행하며 재검토. |
| PR18 | 자동 재생성 → AI 냄새 짙어짐 | 재생성 후 Teddy 눈검수 의무 배너. 3점 미만 수동 수정. |
| PR18 | MAX_REGEN=2 비용 폭증 | Haiku 100통×10%×2 ≈ $0.02. 무시 가능. |
| PR18 | K-Beauty 키워드 어색 | "과시형 금지·문맥 속 1회·예시 3개" 프롬프트 + 검증 SQL에 `kb_hits <= 3`. |
| PR19 | 이전 본문 복붙 | 허용 3/금지 2 명문화 + 재시도 프롬프트에 위반 예시 삽입. |
| PR19 | 수기 슬롯 사용 시 삽입 위치 오류 | 프롬프트 "다른 문장 수정 금지 + 삽입 위치 2~3문단 사이" 명시 + 저장 후 diff 확인. |
| PR21-Docs | 문서만이라 낙관적 공수 | 6개 md × 30분 + AGENTS.md 정리. 0.5일 여유. |
| PR22-Lite | 엔드포인트 없애면 자동화 없음 | Claude 세션 경로가 현실적. `memory/reference_sps_infra.md`에 고정 → 세션 자동 로드. |
| 전반 | Teddy SQL 복붙 해석 어려움 | 각 PR에 (a) 복붙 쿼리 (b) 기대 숫자 (c) 불일치 시 대응 3세트. |

### 4-2. 비즈니스

- **PR17~18까지 고쳐도 회신 0** → 섹션 9 폐기 판단 (2중 트리거).
- **Gmail 일일 500통 한계** → 토 발송 10통 안전.
- **PERPLEXITY_API_KEY 재발생** → PR16 401 분리 로그로 즉시 감지.
- **벤치마크 숫자 의존 위험** — 1~2%·16~33%는 SaaS 값. OEM 시장 실측이 유일. 폐기 판단은 루브릭 기반.

### 4-3. 기술 함정 (신규, Evaluator 기술 함정 1~3 반영)

1. **Deno Edge Function 모듈 분리 위험 — Sprint05 이월 근거**
   - ESM import는 `https://...` 또는 `./relative`. 1259줄 1회 분리 = 배포 1회 실패 시 전체 다운.
   - Sprint05에서 agentB → agentC → agentD → agentE 순차, 각 단계 dry-run 후 prod 배포.

2. **run-pipeline 400초 edge timeout 여유 — PR20 이월 시 Modal UX 주의**
   - agentD BATCH_SIZE_D=5 Promise.all(주석 L580-L582)로 현재 타임아웃 회피 중.
   - Sprint05 PR20에서 on-demand 전환 시 Modal 내부 담당자 3명 Promise.all 동기 실행 → "로딩 20초" UX. 로딩 스피너 + "초안 생성 중..." 명시 필요.

3. **MailQueue uniqueBuyerIds → uniqueContactIds 전환**
   - PR17 구현 시 `totalCount` 정의를 "오늘 작성할 메일 수(contact 단위)"로 재정의.
   - FollowupBuyer 인터페이스 `id`가 기존 buyer.id였음 → PR17 후 contact.id. 영향 받는 모든 참조 `handleEmailClick` / `handleEmailSent` 확인.

---

## 5. 대안

### 5-1. 플랫폼 폐기 시나리오 (경량 워크플로)

**조건**: PR17~18 배포 + 토 실전 5~10통 발송 → **회신 질 루브릭 ③ 이상 0건** (2중 트리거 교차 검증 필수).

**대안 워크플로**:
1. CSV 업로드 → B·C만 실행
2. Claude 세션이 바이어 인텔(JSON) 직접 읽고 → 채팅에 국문 초안 제공
3. Teddy Gmail 초안창 복붙 → DeepL 수동 번역 + 전송
4. 추적/통계는 Pipedrive BCC + Gmail 수동

**장점**: UI/파이프라인 유지보수 0. CEO 1:1 메일 철학에 근접.
**단점**: 메일당 15~20분.

### 5-2. PR 묶음 재구성
- **대안 A (최소 스프린트)**: PR0 + PR16 + PR17만 월~화 이번 주. 수 PR18 부분. 나머지 다음 주. → 회신 검증 지연.
- **대안 B (PR19 최우선)**: breakup 메일 지배 가설 — v2는 기각. 1차 메일 품질(PR17·18)이 먼저 검증돼야 함. breakup은 무시된 경로의 마지막 스트로크이지 지배 요소 아님.
- **권장**: 원안 유지. Teddy 시간 부족 시 대안 A.

### 5-3. 단순화 대안
- 스팸 재생성: MAX_REGEN=1 vs 2 → **2 채택** (안전 마진 + 비용 무시 가능).
- 팔로업: DB 스키마 변경 vs 기존 필드 재사용 → **기존 재사용 채택**.
- 에이전트 분리: 1259줄 1회 vs 점진 → **Sprint05 점진 채택** (배포 리스크 최소).
- PR22: 엔드포인트 신설 vs SQL 템플릿 → **템플릿 채택** (비개발자 경로).

---

## 6. 체크리스트 통과 여부

- [x] **목표 명확?** — 정성 루브릭 1차(이번 주) + 수치 2차(2주 후). 표본 부족 한계 명시.
- [x] **더 단순한 방법 검토?** — 5-3에 4건 비교. PR20/21 Sprint05 이월.
- [x] **리스크 식별?** — PR별 13건 + 비즈니스 4건 + 기술 함정 3건.
- [x] **유지보수 고려?** — PR21-Docs + 비개발자 SQL 3세트 각 PR 포함.
- [x] **각 단계 검증 가능?** — 모든 PR에 복붙 SQL 3세트 + regression 테스트.

---

## 7. 이번 주 실행 일정 (4/20 월 ~ 4/26 일)

| 날짜 | PR | 활동 |
|------|-----|------|
| 월 4/20 오전 | **PR0** | Primary 탭 판정 + DMARC/SPF/DKIM DNS 조회 (Teddy 5분) |
| 월 4/20 오후 | PR16 | 이월 버그 4건 + 백업 SQL + 배포 승인 |
| 화 4/21 | PR17 | 담당자 분리 + Teddy Shin 서명 3체크박스 + spscos.com 본문 + AI 냄새 눈검수 |
| 수 4/22 | PR18 | 스팸 자동 재생성 (MAX_REGEN=2) + 포맷 + K-Beauty |
| 목 4/23 | PR19 | 팔로업 회차 UI + 허용3/금지2 + 수기 1문장 hybrid 슬롯 |
| 금 4/24 | PR21-Docs + PR22-Lite | docs/agents/*.md 6개 + ICP 스킵 사유 UI + SQL 템플릿 |
| 토 4/25 | **실전 5~10통 발송** | 신규 CSV 5명 1차 메일 (현재 파이프라인 그대로) |
| 일 4/26 | 관찰 | Pipedrive BCC + click_events + Gmail 회신 집계 |
| **Sprint05** | PR20 + PR21-Code | 파이프라인 on-demand 재설계 + Deno 모듈 점진 분리 |

### 7-1. 배포 승인 체크포인트
각 PR 배포 전 Teddy 명시 승인:
- `npx tsc --noEmit` 통과 스크린샷
- Vercel preview URL
- Supabase migration 사전 점검 SQL 결과
- **프롬프트 수정 시**: Supabase preview branch dry-run 1회 → prod 배포 (Evaluator 구체 지시 누락 반영)

---

## 8. 필요 도구 / 파일

### 8-1. MCP / 도구
- `mcp__supabase__execute_sql` — 사전 점검 SQL (read-only)
- `mcp__supabase__deploy_edge_function` — run-pipeline / generate-draft / validate-draft 재배포
- `mcp__supabase__get_logs` — 배포 후 즉시 로그
- `mcp__supabase__create_branch` — 프롬프트 수정 dry-run용 preview branch
- `mcp__playwright__browser_*` — MailQueue UX regression (PR17, PR19)

### 8-2. 신규/갱신 md
- `sprints/Sprint04_Plan_v2.md` (본 문서)
- `docs/agents/agent_a.md` ~ `agent_f.md` (PR21-Docs)
- `AGENTS.md` 갱신
- `memory/reference_sps_infra.md` — Claude 세션 중복 체크 SQL 병기 (PR22-Lite)
- `docs/DECISIONS.md` ADR 추가:
  - ADR-036: MailQueue 팔로업 쿼리 buyer_contacts 기준 전환 + totalCount 재정의(contact 단위)
  - ADR-037: 본문 서명 "Teddy Shin" 풀네임 단일화 (UI + agentD + translate_save 3곳)
  - ADR-038: spscos.com 본문 중간 삽입 + P.S. 추적 링크 제거
  - ADR-039: 스팸 자동 재생성 MAX_REGEN=2 + 재생성 후 Teddy 눈검수 배너 의무
  - ADR-040: 팔로업 회차별 프롬프트 + 허용 3/금지 2 + 수기 1문장 hybrid 슬롯
  - ADR-041: PR20 D/E on-demand 재설계 Sprint05 이월
  - ADR-042: Perplexity 401/402 분기 명시 로그 (크레딧 vs 키 무효)

### 8-3. 삭제 후보
- 없음. 1259줄 run-pipeline/index.ts는 Sprint05에서 점진 분리, 이번 주 무변경.
- `memory/project_sps_pipeline_bugs.md` — PR16 배포 후 archive.

---

## 9. 플랫폼 존재 가치 검증 (Teddy 요청 12번)

### 9-1. 회신 가능성 평가

**긍정 근거**:
1. PR17로 "Helen L, Cristina D, Carol N" 합침 같은 즉시적 무례함 제거.
2. PR18로 본문 단락 분리 + K-Beauty 정체성 + 스팸 통과 → Primary 도달률 상승.
3. PR19로 팔로업 3차 breakup — OEM 실측 불명이나 "마지막 스트로크" 구조적 효과.
4. CEO 명의(Teddy Shin) + 초개인화 인텔(Claude+Perplexity) + Korean OEM 차별화.

**부정 근거**:
1. Claude 본문 AI 냄새 — PR17 눈검수 채점 + PR19 수기 1문장 hybrid로 완화하나 **완전 제거 불가**.
2. 바이어 회신이 자동 응답일 가능성 → 루브릭 ①②로 거름.
3. GCC/USA/Europe K-Beauty OEM 콜드메일 포화.
4. 벤치마크 숫자(1~2%, 16~33%)는 SaaS 값, OEM 시장 실측 미확인.

### 9-2. 폐기 판단 2중 트리거 (Evaluator 치명 gap 1 반영)

**임계일**: 2026-05-04 (5/4 월, 2주 후 20~50통 실측 데이터 집계 시점)

**2중 트리거 — 둘 중 하나라도 충족 시 폐기 프로세스 개시**:
- **① 수신자 행동 신호 0**:
  - `click_events` 클릭 0건 + Pipedrive BCC 회신 유입 0건 (20통+ 기준)
- **② 회신 질 루브릭 ③~⑤ 0건**:
  - ①②(자동응답 + 1줄 거절)만 나오고 ③(중립 수신확인) 이상 0건

**중간 체크포인트** (2026-04-26 일):
- 토 실전 5~10통 발송 후 일요일 BCC + click_events + Gmail 확인
- 루브릭 ③ 이상 1건↑ + 본문 구체 참조 + 후속 질문 → **유지 + 2주 후 20~50통 축적**
- 0건 → 5-1 대안 워크플로 전환 검토 (2주 후 최종 결정 연기)

### 9-3. Teddy가 지금 결정할 것

1. **PR0 Primary 판정 결과 공유** (월 오전 후).
2. **이번 주 PR16~17 배포 승인 여부** (각 PR별 개별).
3. **토 실전 발송 신규 CSV 5명 확보 일정** (금 저녁까지 업로드 필수).
4. **폐기 판단 임계일 2026-05-04 확정** 또는 조정.

---

## 10. 조사 중 발견한 load-bearing 사실 (v1 계승 + 교정)

### v1 계승
- **"담당자 3명 합침" 버그 근본 원인은 `MailQueue.tsx` `fetchFollowups`(L162-L220)의 `buyers` 단일 조회** + `buyers.contact_name` 레거시 콤마조인 필드. PR17 `buyer_contacts` JOIN으로 근본 해결.
- `Pipeline.tsx` L208-L219 `isIcpTitle` **이미 구현**. Teddy 체감 "없음"은 스킵 사유 비노출 UX 문제 → PR22-Lite.
- `send-email/index.ts` L168 From 헤더 이미 `Teddy Shin` 교정됨. 남은 건 본문 서명.
- `generate-draft/index.ts` L93-L109 **tracking_token 없으면 `spscos.com/` 폴백 로직 기존 존재** → PR17에서 그대로 활용.

### v2 교정 (Evaluator 사실 검증 반영)
- **`run-pipeline/index.ts` L495-L499는 합격 블록**이지 401/402 분기 위치 아님. 실제 Perplexity 분기:
  - `fetchPerplexitySearch` **L55-L97**: L66-L67에 402만 있음, 401 별도 분기 없음 → PR16에서 401 분기 신규 추가.
  - `callPerplexityForBuyer` **L342-L368**: L354 `result.creditExhausted` 블록. PR16에서 `result.authFailed` 블록 병행 추가.
- **`generate-draft/index.ts` L236은 `Context: Sender is Teddy Shin...` 컨텍스트 줄**이지 sign-off 지시 아님. Sign-off 지시문은 현재 translate_save 프롬프트에 **전혀 없음** → PR17 (c)에서 L236 직후 `SIGN-OFF RULE:` 섹션 **신규 추가**.
- **agentD 영문 L662 P.S. 지시문도 spscos.com 본문 중간 삽입 수정 대상** (v1 누락). L660 SIGN-OFF + L662 P.S. + L685 body_first description + L686 body_followup sign off 4곳 모두 수정.
- **validate-draft 재생성 경로**: 현재 재생성 루프 없음(L141-L240). MAX_REGEN=2 추가 시 `generate-draft` 의 `generate_ko` 액션을 Edge Function 간 fetch로 재호출 (direct fetch 원칙 ADR-009 유지).
- **MailQueue L295-L298 uniqueBuyerIds**: 현재 `followups.forEach(f => add(f.id))`의 `f.id`가 buyer.id. PR17 buyer_contacts 전환 시 `f.id`=contact.id로 의미 변경 → `totalCount`를 "오늘 작성할 메일 수"로 재정의.

---

## Critical Files

- [supabase/functions/run-pipeline/index.ts](supabase/functions/run-pipeline/index.ts) — B~F 1259줄
- [supabase/functions/generate-draft/index.ts](supabase/functions/generate-draft/index.ts) — 모달 국문→영문
- [supabase/functions/validate-draft/index.ts](supabase/functions/validate-draft/index.ts) — 스팸 재검증 (MAX_REGEN 추가)
- [app/components/EmailComposeModal.tsx](app/components/EmailComposeModal.tsx) — 모달 UI
- [app/components/MailQueue.tsx](app/components/MailQueue.tsx) — 팔로업/초안 큐
- [app/components/Pipeline.tsx](app/components/Pipeline.tsx) — ICP 필터 스킵 사유 UI
- [app/components/Emails.tsx](app/components/Emails.tsx) — 폴백 필터
- `memory/reference_sps_infra.md` — Claude 세션 중복 체크 SQL 병기
