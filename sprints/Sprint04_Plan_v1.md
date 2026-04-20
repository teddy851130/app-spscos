# Sprint04 수정 계획 v1 — 바이어 회신율 확보

> 2026-04-20 작성. Generator/Evaluator 루프 1회차 산출물. Evaluator 피드백 반영 후 v2로 갱신 예정.

## 1. 목표

### 1-1. 정성 목표
해외 바이어가 **"다른 콜드메일 100통 속에서 이 한 통만은 읽어보고 1줄이라도 회신"** 하게 만드는 조건 — **담당자 본인 이름으로만 불리고, 한국 기업 정체성이 드러나며, 본문이 스팸/덩어리가 아닌 초개인화 메시지** — 를 성립시키는 것. 기능 완성이 아닌 **회신율**이 KPI이므로 UX 버그 4건(담당자 합침·서명 오류·포맷 덩어리·추적 링크 404)만 해결돼도 회신율은 유의미하게 반등할 가능성이 있고, 그렇지 않다면 플랫폼을 폐기하는 편이 낫다.

### 1-2. 정량 성공 기준 (이번 주 말 ~ 2주 후 측정)
- **1차 기준**: 테스트 발송(5~10통) 중 **최소 1통 사람이 쓴 회신** 확보 (자동 회신·OOO·bounce 제외). 0이면 구조적 실패 → 섹션 9 폐기 판단.
- **2차 기준(2주 후)**: 전체 발송 50~100통 중 **회신율 3% 이상** (업계 평균 1~2% 감안, 초개인화+CEO 명의+한국 OEM 차별화로 3% 도달 가능).
- **파이프라인 안정성**: race condition 없이 10명 발송 성공 (drafts 중복 처리 0건, status 모순 0건).
- **비개발자 셀프 운영 가능**: 각 PR에 Teddy 검증 스크립트(SQL 또는 UI 클릭 경로) 포함.

### 1-3. 비(非)목표
- 완전 자동 파이프라인/배포 자동화 — 비개발자 위험.
- UI 리디자인 — 회신율 영향 불명확.
- 통합 웹사이트(spscos.com) 구축 — 본 스프린트 범위 외. 추적 URL은 spscos.com 루트 폴백으로 대기.

---

## 2. 접근 방식 & 근거

### 2-1. 우선순위 원칙
회신율 영향 = **수신자가 본문을 연 첫 5초의 인상**에 좌우됨. 3그룹:

- **Group 1 (CRITICAL, 월~화)** — 발송 메일의 파괴적 결함 제거.
  - PR16: 파이프라인 이월 버그 4건
  - PR17: 담당자 분리 + Teddy Shin 서명 + spscos.com 본문 삽입
- **Group 2 (HIGH, 수~목)** — 본문 품질 결함 제거.
  - PR18: 스팸 자동 재생성 + 본문 포맷 + K-Beauty 워딩
  - PR19: 팔로업 회차 로직 (이전 본문 노출 + 회차별 D 프롬프트)
- **Group 3 (MEDIUM, 금~주말)** — 유지보수성 + 워크플로.
  - PR20: 파이프라인 단계 재설계 (D/E 발송 직전 실행)
  - PR21: 에이전트별 스펙 md + 코드 모듈 분리
  - PR22: ICP 필터 + 사전 중복 제거 자동화

### 2-2. 묶음 근거
- **PR17 우선**: Teddy 제기 12건 중 #2·#5·#6이 **한 바이어 1회 열람에서 동시 노출**되는 표면 결함. 따로 PR하면 배포 3회. 1회로.
- **PR18 3건 묶음**: 모두 `generate-draft` 프롬프트 + 후처리 유틸 1파일 변경 → 충돌 최소.
- **PR20 후반 배치**: 파이프라인 흐름 전환은 고위험. 본문 품질 확보(PR16~19) 이후에 착수 안전. 본문 품질 실패 시 PR20은 무의미 → 폐기.

### 2-3. 비파괴 원칙
- 각 PR 독립 롤백 가능. 특히 PR20은 PR16~19 검증 후 착수.
- prod 배포는 매번 Teddy 명시 승인 후.

---

## 3. 단계별 실행 (PR 단위)

### PR16 — 파이프라인 이월 버그 4건 일괄 fix

- **목표**: Perplexity 401/402 분리, intel_failed race condition 제거, agentD/E team 필터, Emails.tsx 폴백 정상화.
- **수정 파일**:
  - [supabase/functions/run-pipeline/index.ts](supabase/functions/run-pipeline/index.ts):
    - agentC Perplexity 호출부: 401과 402 분리 메시지 ("401=키 무효, 재확인 필요" vs "402=크레딧 부족, 충전 필요")
    - L495-L499 합격 블록에 `status: 'Cold'` 추가 (race 뒤늦은 성공 시 상태 복구)
    - agentD(L538~) / agentE(L867~)의 `buyer_contacts` SELECT에 `buyers!inner(region)` join + `.eq('buyers.region', team)` 조건. `_team` 언더스코어 제거 → 실사용.
  - [app/components/Emails.tsx](app/components/Emails.tsx) L50-L75: 폴백 필터 `['Contacted','Replied','Sample','Deal','Lost','Bounced']`만. 더 단순한 대안: 폴백 자체 제거.
- **DB migration**: 불필요. 기존 데이터 정리 SQL(수동 1회):
  ```sql
  -- 사전 점검
  SELECT count(*) FROM buyers WHERE status='intel_failed' AND intel_score >= 60;
  -- 확인 후
  UPDATE buyers SET status='Cold', analysis_failed_at=NULL
   WHERE status='intel_failed' AND intel_score >= 60 AND recent_news IS NOT NULL;
  ```
- **Edge Function 재배포**: run-pipeline **필요**.
- **Teddy 검증**:
  1. Supabase SQL Editor → 사전 점검 SQL 건수 확인
  2. 3팀 동시 파이프라인 1회 실행
  3. pipeline_logs에서 직원D 완료 건수가 team별 다른지 (중복 0)
  4. Emails 페이지 상태가 email_logs와 일치
- **예상 공수**: 4h.
- **의존성**: 없음. 최우선.

### PR17 — 담당자 분리 + Teddy Shin 서명 + spscos.com 본문 삽입

- **목표**: 다담당자 합침 버그 근본 해결 + 서명 교체 + 추적 URL → `https://spscos.com/` 본문 중간 자연 삽입.
- **근본 원인 (조사)**:
  - [EmailComposeModal.tsx](app/components/EmailComposeModal.tsx) L126-L137 `generate_ko` 호출: 이미 단일 contact 전달.
  - [generate-draft/index.ts](supabase/functions/generate-draft/index.ts) L83-L197 `generate_ko` 프롬프트: 단일 contact만 받아 `Dear ${contact.contact_name},` 생성.
  - [run-pipeline/index.ts](supabase/functions/run-pipeline/index.ts) agentD L544-L585: `buyer_contacts` row 단위 반복.
  - **→ 합침 원인은 D/E가 아니라 [MailQueue.tsx](app/components/MailQueue.tsx) L162-L220 `fetchFollowups`가 `buyers` 테이블 단일 조회**. `FollowupBuyer.contact_name`이 buyers.contact_name 레거시 콤마조인 값("Helen L, Cristina D, Carol N")을 그대로 상속 → EmailComposeModal에 단일 문자열로 전달 → 인사말 합침.
- **수정 파일**:
  - [MailQueue.tsx](app/components/MailQueue.tsx) L162-L220 fetchFollowups 전면 재작성 — `buyer_contacts` JOIN으로 담당자별 row 분리:
    ```ts
    .from('buyer_contacts')
    .select('id, contact_name, contact_email, contact_title, contact_status, buyer_id, buyers!inner(id, company_name, tier, region, status, last_sent_at, next_followup_at, email_count)')
    .not('buyers.next_followup_at','is',null)
    .lte('buyers.next_followup_at', todayEndUtc)
    .not('buyers.status','in',`(${excludeStatuses.join(',')})`)
    ```
    → L275 `handleEmailClick`에서 `contact_id: bc.id` 확실히 전달.
  - [EmailComposeModal.tsx](app/components/EmailComposeModal.tsx) L718: `Donghwan Shin` → `Teddy Shin`.
  - [generate-draft/index.ts](supabase/functions/generate-draft/index.ts):
    - L156 "Teddy 드림" 유지 (국문)
    - L236 영문 translate_save 프롬프트 sign-off를 `"Warm regards,\nTeddy Shin"`으로 강제
    - L158 / L662 / L685 "P.S. tracking URL" 제거 → 본문 3~4번째 문단 끝에 자연 삽입: `"You can see a short overview of what we do at https://spscos.com/ whenever it's convenient."`
  - [run-pipeline/index.ts](supabase/functions/run-pipeline/index.ts) agentD L626-L687 프롬프트 (5) SIGN-OFF → `"Warm regards,\nTeddy Shin"`.
  - 추적 기능 자체는 tracking_token 존재 시 자동 TRACK_BASE로 교체되는 기존 로직 유지 → 통합사이트 런칭 시 자동 회복.
- **DB migration**: 불필요.
- **Edge Function 재배포**: generate-draft + run-pipeline **필요**.
- **Teddy 검증**:
  1. Rara Beauty(3명) MailQueue → 각 담당자별 행 3개 노출
  2. "Helen L" 행 클릭 → 모달 인사말 `Dear Helen L,`만
  3. 영문 번역 후 서명 `Warm regards, Teddy Shin` 확인
  4. 본문 중간 1회 `https://spscos.com/` 등장, P.S. 링크 없음
- **예상 공수**: 1일.
- **의존성**: PR16 선행.

### PR18 — 스팸 자동 재생성 + 본문 포맷 + K-Beauty 워딩

- **목표**: flag 판정 시 수동 폐지, 본문 단락 분리 강제, K-Beauty 정체성 삽입.
- **수정 파일**:
  - [validate-draft/index.ts](supabase/functions/validate-draft/index.ts): flag 판정 시 **MAX_REGEN=2** 루프. 각 시도 프롬프트에 "이전 시도 스팸 위반 사유: {issues}. 해당 단어·패턴 회피하여 재작성" 주입. 2회 실패하면 최종 flag.
  - [EmailComposeModal.tsx](app/components/EmailComposeModal.tsx) L228-L271: validate-draft가 재생성 포함 최종 본문 반환 → UI에 "자동 재생성 N회 후 통과" 표시.
  - [generate-draft/index.ts](supabase/functions/generate-draft/index.ts) L144-L164 국문 프롬프트:
    - "본문은 **빈 줄 2칸**으로 구분된 3~4개 문단. 한 문단 = 1~3문장. 덩어리 금지."
    - "본문 어딘가에 `K-Beauty`/`Korea`/`Made in Korea` 중 1~2개 자연 삽입 (과시형 금지)."
  - 영문(translate_save, agentD)도 동일 규칙.
  - **후처리 유틸** `normalizeParagraphs(body)` 추가: `\n` 3줄↑ → `\n\n` 강제, 문단 400자↑면 마침표 기준 자동 분리. DB 저장 직전 호출.
- **DB migration**: 불필요.
- **Edge Function 재배포**: generate-draft + validate-draft **필요**.
- **Teddy 검증**:
  1. 스팸 단어(free/guarantee) 포함 저장 → 자동 재생성 통과 or MAX_REGEN 후 flag
  2. Gmail 본인 발송 → 단락별 줄바꿈 확인
  3. "K-Beauty"/"Korea"/"Made in Korea" 1~2개 포함 확인
- **예상 공수**: 1일.
- **의존성**: PR17 완료 후.

### PR19 — 팔로업 회차 로직

- **목표**: 팔로업 버튼 클릭 시 첫 발송과 구별되는 UI. 회차·이전 본문·회차별 가이드 노출. 반복 메일 방지.
- **수정 파일**:
  - [EmailComposeModal.tsx](app/components/EmailComposeModal.tsx): `emailType: initial|followup1|followup2|breakup` props 또는 buyer.email_count 기반 자동 파생(L524-L528 존재). 상단 회차 배지. **"이전 발송 내역" 탭 신규**: `email_logs`에서 buyer_id+contact_id 쿼리, sent_at desc, body_en/subject/sent_at 목록.
  - [generate-draft/index.ts](supabase/functions/generate-draft/index.ts) `generate_ko` 액션에 `email_type`, `previous_emails` 파라미터 수용. 프롬프트 분기:
    - `initial`: 기존 CIA 프레임워크
    - `followup1`: case study angle — 이전 메일 요약 언급 + 업계 관찰 공유 + 새 각도 15분 요청
    - `followup2`: breakup angle — 업계 평균 회신률 16~33%. "지금이 적기 아닌 것 같습니다. 때가 되시면 언제든. 이후 연락드리지 않겠습니다." 톤
    - `breakup` 이후 UI 버튼 비활성화
  - **DB 스키마 무변경** — 기존 `body_followup` 단일 필드 재사용, email_count 기반 프롬프트 분기만.
- **DB migration**: 불필요.
- **Edge Function 재배포**: generate-draft **필요**.
- **Teddy 검증**:
  1. email_count=1 바이어 → "1차 팔로업" 배지, 이전 발송 내역 탭 1건
  2. 생성 국문이 1차와 각도 다른지(case study)
  3. email_count=2 → breakup 톤
- **예상 공수**: 1.5일.
- **의존성**: PR18 완료 후.

### PR20 — 파이프라인 단계 재설계

- **목표**: CSV 업로드 → B·C만 자동. D/E는 메일 작성 시점 on-demand. "오늘 보낼 메일" 메뉴 존재의의 재정의 = C 합격 + 미발송 contact 버튼형 노출.
- **수정 파일**:
  - [run-pipeline/index.ts](supabase/functions/run-pipeline/index.ts) 메인 orchestrator에서 agentD(L538) / agentE(L867) 자동 호출 제거. `invokeAgentD/E`는 별도 엔드포인트 파라미터로 유지.
  - [EmailComposeModal.tsx](app/components/EmailComposeModal.tsx): 기존 `handleGenerateKo` + `handleTranslateAndSave`가 이미 on-demand 역할 수행 중 → 실제 변경은 run-pipeline 제거뿐.
  - [Pipeline.tsx](app/components/Pipeline.tsx) 실행 버튼 텍스트 "B·C 실행 (이메일 검증 + 인텔 분석)"으로 변경.
  - [MailQueue.tsx](app/components/MailQueue.tsx) 섹션 재설계: **① 오늘 작성할 메일(C 합격+미발송) / ② 팔로업 필요 / ③ 미발송 초안(D·E 통과)**.
- **DB migration**: 불필요.
- **Edge Function 재배포**: run-pipeline **필요**.
- **Teddy 검증**:
  1. 새 CSV → pipeline_logs에 B·C만, D/E 없음
  2. MailQueue ① 섹션에 C 합격 신규 노출
  3. 모달에서 "국문 초안 생성" → D 실행 로그 1건
- **예상 공수**: 1일.
- **의존성**: PR16~19 모두 완료 후.

### PR21 — 에이전트별 스펙 md + 코드 모듈 분리

- **목표**: 1259줄 `run-pipeline/index.ts` → 에이전트별 파일. 각 에이전트 스펙 docs/agents/agent_*.md.
- **수정 파일**:
  - 신규 `docs/agents/agent_a.md` (발굴 워크플로 + ICP 체크리스트)
  - 신규 `docs/agents/agent_b.md` (ZeroBounce 401/402 분기)
  - 신규 `docs/agents/agent_c.md` (Claude+Perplexity 스펙, intel_score 공식, threshold 60)
  - 신규 `docs/agents/agent_d.md` (CIA+Challenger, SPAM_WORDS 35개, K-Beauty 규칙)
  - 신규 `docs/agents/agent_e.md` (스팸 5규칙, autoFix, MAX_REGEN=2)
  - 신규 `docs/agents/agent_f.md` (모니터링 경고 조건)
  - 리팩토링: `supabase/functions/run-pipeline/agents/agent{B,C,D,E,F}.ts`로 분리. `index.ts`는 orchestrator만.
  - `AGENTS.md` 6줄 → 각 agent_*.md 인덱스 링크.
- **DB migration**: 불필요.
- **Edge Function 재배포**: run-pipeline **필요** (Deno relative import 허용).
- **Teddy 검증**: 기존과 동일 동작 + `npx tsc --noEmit` 통과.
- **예상 공수**: 1일.
- **의존성**: PR16~20 완료 후 (기능 무변경).

### PR22 — ICP 필터 + 사전 중복 제거 자동화

- **목표**: Pipeline.tsx의 기존 ICP 필터(L208-L219) + 도메인 중복(L160-L184)을 **사용자 노출 + 자동 점검 스크립트**로 강화.
- **수정 파일**:
  - [Pipeline.tsx](app/components/Pipeline.tsx) L208: 스킵 사유 사용자 노출 — "Sales Director → buying/procurement 키워드 미포함으로 제외" 식으로 `firstError` 리스트 확장.
  - 신규 `scripts/precheck-domains.ts` 또는 `supabase/functions/precheck-domains/index.ts`: 도메인 배열 POST → buyers 매칭 결과 반환. Claude가 Apollo/Clay 단계에서 호출.
  - [docs/agents/agent_a.md](docs/agents/agent_a.md) ICP 체크리스트:
    1. Tier1: $50M+/500명+. Tier2: $5M~$50M/50~500명.
    2. 직함: buying/procurement/beauty/npd/sourcing/product development. 시니어리티: manager/senior manager/director.
    3. 지역: GCC/USA/Europe(UK+France+Germany).
    4. MOQ 3,000+ 수용 가능.
- **DB migration**: 불필요.
- **Edge Function 재배포**: precheck-domains 신규 (선택).
- **Teddy 검증**:
  1. Sales Director 혼입 CSV → "ICP 직함 미달 N건" 표시
  2. 기존 도메인 포함 CSV → "중복 도메인 M건 스킵" 표시
- **예상 공수**: 0.5일.
- **의존성**: 독립 (PR21 이후 문서 일관성 좋음).

---

## 4. 리스크

### 4-1. PR별

| PR | 리스크 | 완화책 |
|----|--------|--------|
| PR16 | race fix가 새 race 유발 | advisory lock 대신 **status overwrite만** 추가. 최소 변경. |
| PR17 | MailQueue 쿼리 재작성 → 큐 비어 보이는 regression | 배포 전 SQL Editor에서 동일 쿼리 실행해 건수 비교. |
| PR18 | 스팸 재생성 루프 무한 → Claude 비용 폭증 | `MAX_REGEN=2` 하드 상한. 3회↑ flag 시 수동 안내. |
| PR18 | K-Beauty 키워드 어색 → 역효과 | "과시형 금지·문맥 속 1회만·예시 3개" 프롬프트. 5통 샘플 Teddy 눈검수. |
| PR19 | 회차별이 오히려 이전 본문 반복 | "이전 subject·첫 문장 재사용 금지". body_en raw 인용 금지, 요약만. |
| PR20 | "오늘 보낼 메일" 재설계 UX 혼동 | 섹션 헤더 3구분 명시 ("작성 대기 / 팔로업 / 미발송 초안"). |
| PR21 | 모듈 분리 시 Edge Function 배포 실패 | 기능 무변경. 배포 후 파이프라인 1회 회귀 검증. |
| 전반 | Teddy 비개발자 디버깅 어려움 | 각 PR에 "5분 검증 SQL + 스크린샷 포인트" 포함. |

### 4-2. 비즈니스
- **PR17~18까지 고쳐도 회신 0** → 섹션 9 폐기 판단.
- **Gmail 일일 500통 한계** → 테스트 10통 안전, 대량 전 RUNBOOK 확인.
- **PERPLEXITY_API_KEY 재발생** → PR16 401 분리 안내로 완화.

---

## 5. 대안

### 5-1. 플랫폼 폐기 시나리오 (경량 워크플로)
**조건**: PR17~18 배포 후 5~10통 테스트에서 사람 회신 0 + Teddy가 본문을 직접 읽고 "내가 받으면 스팸행"이라 판단.

**대안**:
1. CSV 업로드 → B·C만 실행
2. Claude 세션이 바이어 인텔(JSON) 직접 읽고 → 채팅에 국문 초안 제공
3. Teddy가 Gmail 초안창 복붙 → DeepL 수동 번역 + 전송
4. 추적/통계는 Pipedrive BCC에 맡김

**장점**: UI/파이프라인 유지보수 0. CEO 1:1 메일 철학에 근접.
**단점**: 메일당 15~20분.
**폐기 판단**: 5통 중 1통 회신 → 유지. 0통 → 2주 뒤 20통 추가. 또 0통 → 폐기.

### 5-2. PR 묶음 재구성
- **대안 A (빠른 검증)**: PR16+PR17만 이번 주, 나머지 다음 주. → 회신율 저평가 위험.
- **대안 B (PR19 최우선)**: 팔로업 breakup 메일이 회신률 지배 → PR19를 Group 1로 승격. → 테스트 복잡도 증가.
- **권장**: 원안 유지. Teddy 시간 부족 시 대안 A.

### 5-3. 단순화 대안
- 스팸 재생성: N회 루프 → **1회 재호출**로 더 단순화 검토 → 본 플랜은 **MAX_REGEN=2** 채택 (안전 마진).
- 팔로업: DB 스키마 변경 vs 기존 필드 재사용 → **기존 재사용** 채택.
- 에이전트 분리: 1259줄 1회 분리 vs D/E만 우선 → **PR20 후 전체 분리** 채택 (로직 변경 완료 뒤라 안전).

---

## 6. 체크리스트 통과 여부

- [x] **목표 명확?** — 회신율 3%(2주 후) + 5통 중 1통(이번 주) 정량 기준.
- [x] **더 단순한 방법 검토?** — 5-3에 3건 비교.
- [x] **리스크 식별?** — PR별 7건 + 비즈니스 3건.
- [x] **유지보수 고려?** — PR21 에이전트 분리 + 비개발자 검증 SQL 각 PR 포함.
- [x] **각 단계 검증 가능?** — 모든 PR에 Teddy 검증 3~4단계.

---

## 7. 이번 주 실행 일정 (4/20 월 ~ 4/26 일)

| 날짜 | PR | 활동 |
|------|-----|------|
| 월 4/20 | PR16 | 이월 버그 4건 + 배포 승인 + Teddy SQL 검증 |
| 화 4/21 | PR17 | 담당자 분리 + Teddy Shin + spscos.com 본문 + Rara Beauty 테스트 |
| 수 4/22 | PR18 | 스팸 자동 재생성 + 포맷 + K-Beauty |
| 목 4/23 | PR19 | 팔로업 회차 UI + 회차별 프롬프트 + 이전 본문 |
| 금 4/24 | PR20+PR21 | 파이프라인 재설계 + 에이전트 모듈 분리 + docs/agents/*.md |
| 토 4/25 | PR22 + 테스트 | ICP 필터 노출 + precheck-domains + **실전 5~10명 발송** |
| 일 4/26 | 관찰 | Pipedrive BCC 모니터링 + 회신 집계 + 섹션 9 판단 |

### 7-1. 배포 승인 체크포인트
각 PR 배포 전 Teddy 명시 승인:
- `npx tsc --noEmit` 통과 스크린샷
- Vercel preview URL
- Supabase migration 사전 점검 SQL 결과

---

## 8. 필요 도구 / 파일

### 8-1. MCP / 도구
- `mcp__supabase__execute_sql` — 사전 점검 SQL (read-only)
- `mcp__supabase__deploy_edge_function` — run-pipeline / generate-draft / validate-draft 재배포
- `mcp__supabase__get_logs` — 배포 후 즉시 로그
- `mcp__playwright__browser_*` — MailQueue UX regression (PR17, PR19)

### 8-2. 새 md
- `sprints/Sprint04_Plan_v1.md` (본 문서)
- `docs/agents/agent_a.md` ~ `agent_f.md` (PR21)
- `AGENTS.md` 갱신 (인덱스 링크)
- `docs/DECISIONS.md` ADR 추가:
  - ADR-036: MailQueue 팔로업 쿼리 buyer_contacts 기준 전환
  - ADR-037: 본문 서명 "Teddy Shin" 단일화
  - ADR-038: spscos.com 본문 중간 삽입 + P.S. 추적 링크 제거
  - ADR-039: 스팸 자동 재생성 MAX_REGEN=2
  - ADR-040: 팔로업 회차별 D 프롬프트 분기 (스키마 무변경)
  - ADR-041: D/E on-demand 실행

### 8-3. 삭제 후보
- 없음. 1259줄 run-pipeline/index.ts는 **분리하되 삭제 않음**(orchestrator 유지).
- `memory/project_sps_pipeline_bugs.md` — PR16 배포 후 archive.

---

## 9. 플랫폼 존재 가치 검증 (Teddy 요청 12번)

### 9-1. 회신 가능성 평가

**긍정 근거**:
1. PR17로 "Helen L, Cristina D, Carol N" 합침 같은 즉시적 무례함 제거 → 열람 직후 거부감 소거.
2. PR18로 본문 덩어리 → 단락 분리 + K-Beauty 정체성 + 스팸 통과 → Gmail Primary 도달률 상승.
3. PR19로 팔로업 3차 breakup 업계 평균 16~33% 회신 — 이것만 정상 작동해도 전체 3% 가능.
4. CEO 명의(Teddy Shin) + 초개인화 인텔(Claude+Perplexity) + Korean OEM 차별화 3요소는 타 SaaS 복제 불가.

**부정 근거**:
1. Claude 본문은 여전히 "AI 냄새" 가능. 영미권 프로는 2024~25년부터 AI 본문 즉시 식별.
2. 바이어 회신이 자동 응답("샘플 요청서 아래 링크...")일 수 있음 → 사람 회신 0.
3. GCC/USA/Europe 3지역 K-Beauty OEM 콜드메일 포화. CEO여도 10~20통 중 묻힘.

### 9-2. 권고

**우선**: 본 플랜대로 PR16~19 배포 + 4/25~26 5~10명 실제 발송 → Pipedrive BCC + Gmail 모니터링. **사람 회신 1건↑** → 유지 + PR20~22. **0건 + 오픈 0** → 5-1 대안 전환.

**최종 백업**: 플랫폼 폐기 시에도 `buyers` + `buyer_contacts` + `recent_news` DB 유지. Claude가 바이어 ID로 인텔 읽고 직접 국문 초안을 채팅 제공 → "인텔 뷰어 + Claude 비서" 2인 모드 축소. Buyers 페이지만 유지.

**Teddy가 지금 결정할 것**:
1. 이번 주 PR16~17 배포 승인 여부
2. 테스트 발송 5통 수신자 선정 (기존 미회신 lead 중 5곳)
3. 회신 0 시 폐기 판단 임계일 (제안: 2026-05-04)

---

## 10. 조사 중 발견한 load-bearing 사실

- **"담당자 3명 합침" 버그의 실제 원인은 generate-draft/agentD가 아니라 `MailQueue.tsx` fetchFollowups가 `buyers` 테이블 단일 조회** (L162-L220). `buyers.contact_name` 레거시 콤마조인 필드가 단일 문자열로 상속되어 인사말 합침. PR17 buyer_contacts JOIN 전환으로 근본 해결.
- `Pipeline.tsx` L208-L219에 **ICP 직함 필터 이미 구현**. Teddy 체감 "없음"은 스킵 사유가 UI 비노출이기 때문.
- `send-email/index.ts` L168 From 헤더 이미 `Teddy Shin` 교정됨. 남은 건 본문 서명 일관화.
- `generate-draft/index.ts` L93-L109 **tracking_token 없으면 `spscos.com/` 폴백** 로직 기존 존재 → PR17에서 그대로 활용.

---

## Critical Files

- [supabase/functions/run-pipeline/index.ts](supabase/functions/run-pipeline/index.ts) — B~F 1259줄
- [supabase/functions/generate-draft/index.ts](supabase/functions/generate-draft/index.ts) — 모달 국문→영문
- [app/components/EmailComposeModal.tsx](app/components/EmailComposeModal.tsx) — 모달 UI
- [app/components/MailQueue.tsx](app/components/MailQueue.tsx) — 팔로업/초안 큐
- [supabase/functions/validate-draft/index.ts](supabase/functions/validate-draft/index.ts) — 스팸 재검증
