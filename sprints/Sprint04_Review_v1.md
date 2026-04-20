# Sprint04 Plan v1 — Evaluator Review

> 2026-04-20 작성. Generator/Evaluator 루프 1회차. 이 리뷰를 반영해 v2를 작성해야 93~97점에 도달할 수 있다.

## 총점: 84 / 100

## 항목별 점수
- A. 문제 커버리지: 35 / 40
- B. 구체성: 17 / 20
- C. 회신율 실효성: 14 / 20
- D. 리스크/대안: 8 / 10
- E. 실행 가능성: 10 / 10

---

## 강점 (5개)

1. **12가지 원 요구사항 모두 PR에 매핑** — 누락 0건. #12(플랫폼 존재 가치) 섹션 9 독립 분리, 숫자 기준까지 명시해 "회신 0통 = 폐기" 의사결정 객관화.
2. **근본 원인 올바르게 짚음** — "담당자 3명 합침" 버그 원인을 generate-draft가 아니라 `MailQueue.tsx` `fetchFollowups`의 `buyers` 단일 조회 + 레거시 `contact_name` 콤마조인 필드로 특정. 실제 코드 확인 결과 정확. 이 한 가지만으로 Generator가 코드를 실제로 읽었다는 증거 확보.
3. **PR 그룹 3단 구조** (CRITICAL → HIGH → MEDIUM) — 회신율 영향 큰 것(PR17·18) 먼저 월화 배치, 고위험 파이프라인 재설계(PR20) 후순위. 배포 일정 위험 분산 타당.
4. **비개발자 검증 경로 모든 PR에 3~4단계로 명시** — SQL Editor 쿼리·UI 클릭·로그 확인 포인트 구체. "5분 검증 SQL + 스크린샷 포인트" 약속.
5. **load-bearing 사실 섹션 10** — 이미 구현된 부분(Pipeline.tsx ICP 필터 L208, generate-draft tracking 폴백 L109, send-email From 헤더 L168 "Teddy Shin")을 먼저 조사하고 "다시 구현하지 않는다"는 판단. 중복 작업 방지.

---

## 치명적 gap (반드시 v2에서 해결)

### 1. "회신율 3%"의 근거가 허술 — 과학적 검증 경로 부재
- Plan 1-2에서 "업계 평균 1~2%, 3% 도달 가능" 주장하지만 **5~10통 샘플에서 3% 측정은 통계적 유의미성 0** (5통 × 3% = 0.15통 = 사실상 0이나 1만 측정 가능). 표본 부족으로 "사람 회신 1건"이 회신율 3%를 증명하지 못함.
- **v2 요구**: 1차 기준을 "5~10통 중 1건"의 **정성 조건**으로 명확히 재정의 — 회신 내용이 자동 응답 아님 + 본문 구체 참조 포함 + 후속 질문 있음. 회신율 수치는 **2주 후 20~50통 발송 이후**에만 의미 있다고 명기.
- **플랫폼 폐기 판단 2중 트리거**: ① 수신자 행동(오픈율 Pipedrive로 추적 가능?) ② 회신 질 (5단계 루브릭 — 자동/OOO/1줄 거절/구체 질문/MTG 요청). 현재 "사람 회신 1건↑ = 유지"는 너무 느슨.

### 2. "AI 냄새" 리스크에 대한 대응 전무
- Plan 9-1 부정근거 1번 "Claude 본문은 여전히 AI 냄새 가능"을 인정만 하고 **완화책 제시 없음**. 이게 플랫폼 실패의 가장 큰 단일 원인일 확률이 높은데도.
- **v2 요구**: 각 PR에 "사람이 쓴 것처럼 보이는가" 체크 — 예컨대 (1) Teddy가 생성본 5개를 눈으로 읽고 "AI냄새 지수 1~5" 점수, (2) 실제 회신 온 바이어가 있다면 그 메일의 공통 패턴 역추적, (3) PR19 팔로업에 Teddy 본인 1문장 수기 삽입 슬롯(자동+수동 하이브리드) 검토.

### 3. Gmail 스팸/Promotions 탭 방어책 부재
- Plan이 "본문 덩어리 금지·K-Beauty 워딩·스팸 단어 제거"에 집중하나 **Primary 도달률을 결정하는 기술 요소 (SPF/DKIM/DMARC 정렬, 도메인 신뢰도, 사용자 engagement signal)**는 전혀 언급 안 함.
- Plan 4-2 "DMARC" 한 줄 언급 있으나 **현재 정책 단계(p=none → quarantine → reject 예정) 플랜 연계 없음**.
- **v2 요구**: PR16~18과 별도로 "발송 인프라 체크리스트 PR0" 신설 — (1) DMARC 현재 상태 확인 SQL 또는 DNS 조회, (2) Teddy가 자신의 Gmail(타 계정)로 먼저 5통 받아 Primary/Promotions 어디 떨어지는지 확인, (3) Promotions 탭이면 절대 회신 안 나옴 → 구조적 실패.

### 4. PR22 "사전 중복 제거"가 바이어 발굴 단계와 단절
- Plan이 `precheck-domains` 엔드포인트 제안하나 **"Claude가 Apollo/Clay 단계에서 호출"이 막연함**. Teddy는 비개발자이고 Clay에서 직접 API 호출은 불가능.
- 사용자 메모리(`feedback_buyer_dedup_check.md`)가 "Claude가 회사 후보 선정 직후 Supabase buyers 도메인 조회로 중복 사전 제거"를 요구한 건 **Teddy와 Claude 세션 대화 워크플로**지 웹훅이 아님.
- **v2 요구**: PR22를 "Claude가 매번 Apollo 결과를 받을 때마다 실행할 정형 SQL 쿼리 템플릿 1개"로 재정의. `memory/reference_sps_infra.md`에 고정 위치로 추가해 세션 시작 시 자동 로드.

---

## 중요 gap (v2에서 보강 권장)

1. **PR17의 MailQueue 재작성 regression 완화책 피상적** — "SQL Editor에서 건수 비교"만으론 부족. `buyer_contacts` JOIN 전환 시 **이미 발송된 contact의 팔로업 포함 여부** 검증 경로 필요. 현재 `fetchFollowups`는 buyers 기준이라 "1 buyer = 1 row" 원칙. PR17 이후엔 "3 contacts = 3 rows" → UI 카운트 계산(L295 `uniqueBuyerIds`)까지 영향. v2에선 테스트 케이스로 "Rara Beauty 3명 모두 미발송 + 이미 2명 발송/1명 미발송 두 시나리오" 명시.

2. **PR18 "자동 재생성 MAX_REGEN=2"의 비용 시나리오 단순** — 100통 발송 시 10% flag → 10건 × 2회 재시도 × Claude Haiku ≈ $0.02. 리스크 크지 않음. 하지만 **재생성 자체가 AI 냄새를 더 짙게 만들 수 있음** (스팸단어 피하려다 어색한 영어). v2에선 "재생성 후 Teddy 눈검수 의무" 추가 단계 필요.

3. **PR19 팔로업 이전 본문 인용 규칙 모호** — "이전 subject·첫 문장 재사용 금지", "요약만". 바이어가 이전 메일을 기억 못 할 가능성 높은데 요약만 허용하면 "무엇에 대한 팔로업인지" 불명확. **v2**: 팔로업에서 허용 참조 3가지 구체화 — ① 이전에 언급한 바이어 구체 고유명사 1개, ② 이전 ASK 주제(15분 미팅 등), ③ 발송 시점. 금지 — 이전 본문 문장 그대로 복붙, "지난번 메일 보셨나요" 식 죄책감 자극.

4. **PR20 파이프라인 단계 재설계의 의존성 역전 가능성** — Plan은 "PR16~19 완료 후 PR20 착수"인데, 만약 PR16~19 검증에서 회신 0 나오면 PR20은 폐기됨 (섹션 5-1 대안 워크플로 경로). 그런데 Plan 일정표는 PR20을 금(4/24)에 넣음 → **4/25 토 실전 발송 전에 PR20 배포되면 실전 발송 자체가 재설계된 플로우 위에서 이뤄짐** → 검증 변수 증가. **v2**: PR20을 4/27 이후로 미루거나, "실전 5~10통 발송 결과를 본 뒤 PR20 착수"로 순서 조정.

5. **ICP 필터 (Plan PR22) — 이미 구현되어 있어 신규 PR 가치 낮음** — Pipeline.tsx L208-L219 `isIcpTitle` 이미 동작. Teddy가 체감 "없음"은 사용자 노출 UX 문제. **v2**: PR22를 "UX 개선 0.5일 + 도메인 중복 SQL 템플릿 1개"로 축소하고, 에이전트 A 문서(`docs/agents/agent_a.md`)에 "Claude 세션에서 매번 실행할 중복 체크 SQL" 고정.

6. **테스트 발송 수신자 선정 기준 모호** — Plan 9-3 "기존 미회신 lead 중 5곳". 하지만 기존 미회신자는 이미 한 번 무시한 바이어 → 2회차 발송으로 가중치 낮음. **v2**: 신규 CSV 업로드 + 새 인텔 생성 바이어 5명에게 1차 메일 발송으로 재설계.

7. **데이터 정리 SQL (Plan PR16)의 사전 점검이 느슨** — `intel_score >= 60 AND recent_news IS NOT NULL` 조건. 하지만 `analysis_failed_at` NULL 처리 조건 빠짐. 롤백 포인트 없음. **v2**: migration 직전 백업 SQL + 롤백 SQL 양쪽 포함.

8. **`docs/agents/agent_*.md` 6개 파일 (PR21) — PR21 "기능 무변경 리팩토링"이 1일 공수로 너무 낙관적** — 1259줄 Edge Function 분리는 Deno import 경로·빌드 스크립트 모두 영향. **v2**: PR21을 "문서(`agent_*.md` 6개)만 이번 주 + 코드 분리는 Sprint05로 이월"로 쪼개기.

---

## 사실 검증 결과 (line number 정확성)

### 정확한 인용 (그대로 사용 가능)
- `MailQueue.tsx` **L162-L220** `fetchFollowups` — **정확**. `buyers` 단일 조회, `buyer_contacts` JOIN 없음. 근본 원인 진단 맞음.
- `EmailComposeModal.tsx` **L718** `Donghwan Shin` UI 텍스트 — **정확**.
- `run-pipeline/index.ts` **L538** `async function agentD(sb, jobId, _team)` — **정확**. `_team` 언더스코어 prefix → 실사용 안 함. PR16 지적 맞음.
- `run-pipeline/index.ts` **L867** `async function agentE(sb, jobId, _team)` — **정확**. 같은 패턴.
- `run-pipeline/index.ts` **L626-L687** agentD Claude 프롬프트 — **대체로 정확** (L620~L687 주석 포함). SIGN-OFF는 L660 `"Warm regards," / "Teddy"` — Plan이 "Teddy Shin"으로 강제하려는 지점 맞음.
- `Pipeline.tsx` **L208-L219** ICP 필터 `isIcpTitle` — **정확**. 이미 구현 + seniority 분기까지 존재.
- `Emails.tsx` **L50-L75** 2차 폴백 — **정확**. 현재 `status != 'Cold'` 필터라 `intel_failed` 포함. Plan의 허용 목록 방식 제안 합리.

### 과장 or 일부 오차
- Plan L56 "agentC Perplexity 호출부 401/402 분리" — 실제 코드 확인 필요한데 L495-L499는 **합격 블록**(recent_news + intel_score update)이지 401/402 처리 지점 아님. 401/402 분리 로직은 별도 위치. **v2**: 정확한 line 재확인 필요 (L440 전후 callClaudeIntel / Perplexity 호출 지점).
- Plan L99 "L236 영문 translate_save 프롬프트 sign-off" — 실제 L236은 `Context: Sender is Teddy Shin...` 이고 sign-off 명시 줄은 현재 프롬프트에 없음. 즉 **추가해야 하는 상태**가 맞으나 Plan 표현이 "교체"로 읽혀 오해 소지. v2에서 "신규 sign-off 지시 추가"로 명확화.
- Plan L158 "P.S. tracking URL 제거 → 본문 중간 자연 삽입" — generate-draft 프롬프트는 현재 **L158 라인이 추신 지시문** (`"추신. 3분짜리 미리보기: ${trackingUrl}"`). Plan이 L158을 가리킨 게 맞음. 다만 agentD 영문 프롬프트도 L662(P.S. 지시)에 같은 규칙 있는데 Plan이 둘 다 수정한다고 명시 안 함 → **v2에서 agentD 영문 프롬프트 L662도 함께 수정** 명시 필요.

### 추가 발견
- **generate-draft 프롬프트 L124에 이미 "Teddy Shin" 명의 명시**. 즉 국문/영문 번역 모두 바디에는 "Teddy"가 들어가게 설계됨. Plan의 PR17 서명 수정 실제 작업 대상은 (1) EmailComposeModal UI L718 한 곳, (2) agentD 영문 프롬프트 L660 SIGN-OFF를 `"Teddy"` → `"Teddy Shin"` 로 풀네임화, (3) translate_save 프롬프트에 sign-off 지시문 신규 추가 — 3개 독립 포인트. v2에서 체크박스 3개로 분리.
- **validate-draft는 현재 재생성 루프 없음**. flag/rewrite/pass 3판정 후 즉시 반환. PR18의 `MAX_REGEN=2` 루프는 validate-draft Edge Function 구조 자체를 바꾸는 것 (현재 복사된 agentE 헬퍼 사용). `generate-draft`를 재호출하는지, validate-draft 내부에서 Claude 호출을 직접 하는지 v2에서 경로 명시 필요.

---

## v2에게 주는 구체 지시 (10개)

1. **회신율 KPI 재정의** — "3% 회신율 2주 후"를 "5~10통 중 정성 조건(자동응답 아님 + 구체 참조 + 후속 질문) 만족 1건" + "20~50통 축적 후에만 수치 평가"로 이중화. 표본 부족 문제 명시.
2. **"AI 냄새" 완화 PR 추가 or PR17-19에 체크포인트 삽입** — Teddy 5통 눈검수 루프 + "인간 1문장 수기 슬롯" 하이브리드 옵션 검토. 이게 회신율 가설의 숨은 변수.
3. **PR0 (발송 인프라 점검) 신설** — Teddy 타 Gmail로 5통 테스트 수신 → Primary/Promotions 탭 판정. Promotions 떨어지면 PR16~19 의미 없음. DMARC 정책 단계 확인 SQL or DNS 조회 스크립트 포함.
4. **PR22 재정의** — "Claude 세션 고정 SQL 템플릿 1개" + `memory/reference_sps_infra.md`에 병기. 엔드포인트 신설은 불필요.
5. **PR21 쪼개기** — 이번 주는 `docs/agents/agent_*.md` 6개 문서만. 코드 모듈 분리는 Sprint05로 이월. 1일 공수 현실성 낮음.
6. **PR20 순서 조정** — 토(4/25) 실전 발송 이후로 밀기. 실전 발송이 **현재 파이프라인** 위에서 이뤄져야 회신 0일 때 원인 변수 최소화.
7. **PR16 데이터 정리 SQL 보강** — 백업 SQL + 롤백 SQL + `analysis_failed_at` 처리 명시. 사전 점검 조건을 `(intel_score >= 60 AND recent_news IS NOT NULL AND analysis_failed_at IS NOT NULL)`로 좁히고 기대 건수 사전 측정.
8. **PR17 서명 수정 체크박스 3개로 분리** — (1) EmailComposeModal L718 UI, (2) agentD L660 `"Teddy"` → `"Teddy Shin"`, (3) translate_save 프롬프트에 sign-off 지시 신규. agentD 영문 P.S. L662도 **spscos.com 중간 삽입** 수정 대상에 명시 추가.
9. **테스트 수신자 선정 기준 교체** — "기존 미회신 lead 중 5곳" 대신 "신규 CSV 업로드 + 새 인텔 생성 바이어 5명에 1차 메일". 2회차 재발송은 편향 유발.
10. **PR19 팔로업 참조 규칙 세분화** — 허용 3가지(고유명사 1개·이전 ASK 주제·발송 시점) + 금지 2가지(본문 복붙·죄책감 자극) 프롬프트 명문화. "이전 subject·첫 문장 재사용 금지"만으론 모호.

---

## 잘못된 가정 or 누락된 관점

### 누락된 비즈니스 현실
- **콜드메일 회신율 벤치마크 오해** — Plan이 인용한 "업계 평균 1~2%", "breakup 메일 16~33%"은 **SaaS/B2B 일반 값**이고 **화장품 OEM GCC/USA/Europe 특수 시장의 실제 값은 더 낮을 가능성 큼** (화장품 업계는 기존 공급망 변경 저항 강하고 MOQ 협상 복잡). v2에선 "업계 벤치마크 출처 불명, 실측이 유일한 검증"으로 수위 조정.
- **팔로업 breakup이 "지배적"이라는 주장 과장** (Plan 5-2 대안 B) — breakup이 효과 있는 건 "이미 1~2회 무시된 경로에서 마지막 스트로크"이고, SPS는 1차 메일 품질이 먼저 검증돼야 함. PR19를 Group 1로 승격은 위험.
- **Pipedrive BCC 의존 과다** — Plan이 "추적/통계는 Pipedrive BCC에 맡김" (5-1) 하는데, Pipedrive 자동 연동은 **발송 로그**지 **오픈/클릭 트래킹**은 아님. Teddy가 회신 0을 "아무도 안 읽음" vs "읽고 무시"로 구분 못 함 → 폐기 판단이 흐려짐. `tracking_token` 클릭 이벤트가 유일한 신호인데 spscos.com이 폴백이라 클릭 수집 불가.

### 기술 함정
- **Deno Edge Function 모듈 분리 (PR21) 함정** — ESM import는 `https://...` 또는 `./relative` 경로. `./agents/agentB.ts` 허용되지만 **한 세트 deploy** 아니라 파일별 개별 deploy 필요. 1259줄 한 번에 분리하면 배포 1회 실패 = 전체 파이프라인 다운. 점진 분리 필수.
- **run-pipeline 한 함수가 400초 edge timeout 근접** — agentD BATCH_SIZE_D=5 Promise.all로 이미 타임아웃 회피 중(주석 L580-L582). PR20에서 agentD를 on-demand로 바꿔 orchestrator에서 빼면 timeout 여유는 생기지만 **on-demand 호출 시에도 담당자 3명 Promise.all이 Modal 내부에서 동기 실행** → Modal UX "로딩 20초" 보임. 사전 경고 없으면 Teddy "고장났나?" 혼란.
- **MailQueue `uniqueBuyerIds` 카운트 의미 변경** (L295) — PR17 이후 "3 contacts → 3 rows"라 `followups.forEach(f => uniqueBuyerIds.add(f.id))`의 `f.id`가 buyer.id인지 contact.id인지 불일치 가능. PR17 구현 시 `totalCount` 정의도 재검토 필요 ("오늘 작업해야 할 바이어 수" vs "오늘 작성할 메일 수").

### Teddy 비개발자 제약 관점 누락
- Plan이 모든 PR에 "SQL Editor에서 조회" 검증 단계를 넣지만 **Teddy가 SQL 쿼리 복붙 + 결과 해석을 얼마나 잘 하는지**에 대한 가정 없음. "복붙할 쿼리 블록 + 기대 결과 예시 + 불일치 시 대응"까지 세트로 줘야 실제 검증 가능.
- **"배포 승인 명시성"** (메모리 `feedback_deploy_authorization.md`) 반영되나 **프롬프트 수정 배포 시 내부 검증 부족**. 프롬프트 1글자 바꿔도 Edge Function 재배포 필요 → Teddy 승인 체크포인트 수 폭증. v2에선 "프롬프트 수정 → Supabase preview에서 먼저 1회 dry-run 후 배포" 경로 명시.
