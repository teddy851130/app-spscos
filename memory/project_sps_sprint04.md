---
name: Project - Sprint04 진행 상태
description: SPS 바이어 앱 회신율 확보 스프린트. PR16~PR22-Lite 배포 + 2026-04-22 Teddy 실사용 피드백 일괄 fix 완료 · per-contact tracking 전환 · 가독성/개인화/스팸 비결정성 해결 · 4/25 1차 발송 대기 · 5/10 최종 판정
type: project
originSessionId: e27efffa-00cd-4289-b37d-1adcebf88a93
---
## 현재 단계 (2026-04-22 새벽 기준)

**Sprint04 Day 3 종료.** 오전에 Teddy 실사용 피드백 다수 제기 → 오후~심야에 전부 fix 배포. 핵심 발견: PR17~PR22 커밋은 main 에 들어갔으나 **Supabase Edge Function 재배포가 누락**되어 Teddy가 실제로 본 메일은 PR17 이전 프롬프트 결과물이었음. generate-draft/validate-draft/run-pipeline/send-email 재배포 + 후속 버그 fix 완료. 다음 액션은 토요일(4/25) 1차 5~10통 실전 발송.

## 2026-04-21 오늘 배포한 커밋 (시간순)

| PR | 커밋 | 내용 |
|---|---|---|
| PR16 배포 | `d93076b` (어제 커밋) push | Perplexity 401 분리 · agentC status reset · agentD/E team 필터 · Emails 폴백 엄격화. SQL 사전점검 결과 0건(이미 해소) → DB 정리 skip. |
| PR17 (ADR-043) | `f5616b9` | 담당자 분리(MailQueue → buyer_contacts JOIN per-contact flatten) + HARD LIMITS 7건(150단어·금지 오프닝 6개·설교 금지·회사소개 1줄·Korea 필수·URL 본문 중간·Hi firstName) + SPAM_WORDS 35→50 + `Donghwan Shin`→`Teddy Shin` + validate-draft Korea/단어수 flag |
| PR17.1 (ADR-044) | `2864609` | 서명 5줄 블록(Managing Director + Email/Web/Mobile + 등록 주소) + MAX_WORDS 150→180 |
| PR17.2 (ADR-045) | `5d99f93` | "오늘 보낼 메일" 페이지 완전 제거. Sidebar 메뉴 + page.tsx 라우트 + MailQueue.tsx 파일(-775줄) 삭제. Dashboard 팔로업 섹션에 EmailComposeModal 직접 통합 + buyer_contacts JOIN flatten 이식 |
| PR18 (ADR-046) | `fe6604e` | run-pipeline `agentD`(배치 영문 초안) + `agentE`(배치 스팸 검증) 전체 삭제. SPAM_WORDS/헬퍼 동반 제거. Dashboard "이메일 초안 목록" / "검토 필요" / "인텔 대기" 3개 섹션 제거. run-pipeline 1335→787줄. |
| PR19 (ADR-047) | `976b3c2` | Buyers.tsx + Dashboard 팔로업 섹션 "메일 작성" 버튼을 email_count 기반 5단계 컬러 계단으로 교체. 0=첫 발송/회색, 1=1차 팔로업/노랑, 2=2차 팔로업/녹색, 3=3차 팔로업/빨강, ≥4="보관"/빨강+disabled(tooltip). DB 변경 없음. |
| PR21+22 (ADR-048) | `135b001` | `docs/agents/` 신규 디렉토리에 직원 A~F 스펙 md 6개(20~40줄, 중간 분량) 작성. AGENTS.md 인덱스 추가. Pipeline.tsx CSV 스킵 사유 6종 UI 노출(도메인/회사명·담당자 정보·ICP 직함·3명 포화·이메일 중복·INSERT 실패). reference_sps_infra.md 에 도메인 중복 체크 SQL 병기. agent_d/e.md 는 배치 삭제된 agentD/E 대신 generate-draft/validate-draft 수동 경로로 재정의. |

## 2026-04-22 Teddy 실사용 피드백 일괄 fix (7커밋)

Edge Function 재배포 누락이 최대 근본 원인. PR17/PR17.1 규칙이 코드엔 있었지만 prod Edge Function 에는 미반영 상태로 Teddy가 old 프롬프트 결과물을 보고 있었음.

| 커밋 | 내용 |
|---|---|
| `3fcfa80` | generate-draft/validate-draft/run-pipeline 재배포 · Pipeline UI 직원 D/E 제거(L11-12/L709/L973-974 3곳) · Dashboard 열람율 카드 제거 (grid 4→3) · validate-draft SPS 링크 임계값 3→4 완화 (5줄 서명 3개 매칭 기본 고려) |
| `b03130e` | generate-draft CEO → Managing Director 전면 치환 (프롬프트 헤더 + Context + translate_only) · validate-draft SPAM_WORDS 50→39 정리 (PR17 신규 15개 중 정상 콜드메일 표현 11개 제외 → autoFix 로 문장 파괴 방지) |
| `0f0a68c` | **Rare Beauty 다중 발송 버그 fix**: per-contact tracking 전환. migration `per_contact_email_tracking` — buyer_contacts 에 email_count/last_sent_at/next_followup_at 추가, email_logs 에 buyer_contact_id FK 추가, 기존 buyers 데이터 → primary contact 로 백필 (16건). 신규 RPC increment_contact_email_sent. send-email v15 · Buyers.tsx flatMap / Dashboard 팔로업 쿼리 contact 기반 전환 |
| `a9b1fcc` | 바이어 DB '최신순' 필터 fix — date state 가 filter/sort 에 연결돼 있지 않아 작동 안 함. flatMap 에 lastSentAtRaw 추가 + latest/month/last 필터·정렬 로직 연결 |
| `0810f75` | EmailComposeModal 기본 탭 'en' → 'intel' · 탭 순서 교체 (왼쪽 인텔, 오른쪽 영문) + 1./2. 번호. 모달 열자마자 영문이 먼저 나오던 문제 해결 |
| `5d65b65` | **가독성 + 개인화 + 스팸 비결정성 일괄 fix**: generate-draft firstName 추출 강화 (Hi there 금지) + 수신자 role(contact_title) 본문 1회 강제 언급 + READABILITY RULES (문단 2-3문장, 문장 25단어) · validate-draft Claude temperature 0.2 고정 (기본 1.0 → 호출마다 6/7/8 점 변동 제거) + 루브릭 EVIDENCE REQUIREMENT (7점 이하 판정 시 문제 phrase 2개 이상 인용 필수) · send-email HTML 렌더링 \n\n → `<p margin:0 0 14px 0 line-height:1.6>` 문단 분리 (기존 \n → <br> 단순 치환이 문단 경계/줄바꿈 동일 처리로 3~4줄 덩어리 렌더되던 문제) |
| `761f09b` | **Charlotte Tilbury Beauty 재발현 다중 발송 fix (Rare Beauty 때 놓친 2단 버그)**: (a) migration `per_contact_email_tracking` 의 RPC `increment_contact_email_sent` 가 `RETURNS TABLE(... contact_name TEXT)` 로 정의돼 buyer_contacts.contact_name 컬럼과 모호성 → 호출마다 실패. email_logs 는 INSERT 되지만 email_count 증가 안 됨. send-email catch 가 warning 으로 변환해 UI 는 성공 표시. migration `fix_increment_contact_email_sent_name_collision` 으로 RPC 를 VOID 반환으로 재정의 + Regine Barr 수동 백필. (b) Buyers.tsx handleEmailSent 가 buyer_id 만으로 매칭 → 같은 회사 모든 contact 행이 발송완료로 바뀜. contactId 도 받아서 해당 담당자 행만 갱신. |
| `eccb6df` | **Buyers 상태 컬럼 fallback fix**: flatMap 에서 `c.contact_status \|\| (email_count>0 ? 'Contacted' : row.status)` — buyer 집계 상태를 상속해 같은 회사의 미발송 contact 가 '발송완료' 로 표시됨. row.status 상속 제거, email_count=0 이면 명시적으로 'Cold'. intel_failed 만 예외적으로 전파. |

## 2026-04-22 DB migration

`per_contact_email_tracking` — buyer_contacts 에 담당자별 추적 컬럼 추가 + email_logs 에 contact_id FK + 기존 buyers 16건 → primary contact 백필 + 신규 RPC `increment_contact_email_sent(p_contact_id, p_sent_at, p_next_followup_at)`.

## 2026-04-22 Edge Function 최종 버전

- `generate-draft` v22 → v25 (PR17/PR17.1 반영 + CEO→MD + 가독성/개인화 강화)
- `validate-draft` v17 → v21 (SPAM_WORDS 50 → 39 + SPS 링크 임계값 4 + temperature 0.2 + EVIDENCE 루브릭)
- `run-pipeline` v41 → v42 (PR18 agentD/E 삭제 실반영)
- `send-email` v14 → v16 (per-contact tracking RPC + HTML `<p>` 문단 렌더링)

## 2026-04-22 DB migrations 전체

1. `per_contact_email_tracking` — buyer_contacts 에 email_count/last_sent_at/next_followup_at 추가 + email_logs 에 buyer_contact_id FK + 기존 buyers 16건 → primary contact 백필 + 신규 RPC `increment_contact_email_sent`
2. `fix_increment_contact_email_sent_name_collision` — 위 RPC 를 VOID 반환으로 재정의 (RETURNS TABLE(contact_name TEXT) 의 컬럼명 충돌 제거) + Regine Barr 수동 백필 (email_count=1, last_sent_at, next_followup_at)

## 2026-04-22 실측 검증 결과 (NAOS Bioderma / Marie Duhamel)

- 이전: `Hi there, ... 긴 문단 3~4줄 덩어리 ...` + spam_status=flag, score=7
- 현재: `Hi Marie, ... as your product development role expands ...` + 문단 5개 각 2-3문장 + 5줄 서명 + spam_status=**pass**, score=**9**, fixes=[]

## 합의된 주요 결정

- **초안 생성 경로 단일화**: Buyers DB 페이지 → 바이어 인텔 탭 → 국문 초안(generate_ko) → 영문 번역(translate_save) 수동 경로만. 배치 자동 경로 완전 폐기.
- **콜드메일 서명 5줄 블록 확정**: `Warm regards, / Teddy Shin / Managing Director, SPS International / Email+Web+Mobile / 등록 주소`. 이모지 미사용.
- **팔로업 관리 진입점**: Dashboard "팔로업 필요" 섹션 단일 (MailQueue 페이지 삭제).
- **필터는 드롭다운 X, 버튼 컬러 계단 O**: PR19 배포 완료. email_count 0=회색(첫 발송), 1=노랑(1차), 2=녹색(2차), 3=빨강(3차), ≥4=빨강+disabled("보관"). "보관" 워딩은 Teddy 선택 — 아카이브 의미 일치 + 재발송 실수 차단 목적.

## 이월 / 대기

- **기존 DB draft 3개 재생성** — REFY(Amber)은 실측 중 재생성 완료. Typology(Marie Jacob) / Trinny London(Natalie Hemmings) 은 여전히 4/20 이전 생성분(Dear + CEO + P.S. URL). Teddy가 EmailComposeModal 에서 각각 "영문 반영 및 검증" 재클릭 1회면 새 프롬프트로 재생성됨. 실전 발송 전 필수.
- **PR0 재측정**: 4/22 fix 이후 프롬프트/HTML 전면 변경. Teddy가 자기 앞 2~3통 시험 → Primary 5/5 확인 후 외부 발송. 토(4/25) 1차 발송 직전 필수.
- **실전 발송**: 4/25(토) 5~10통 시작 → 5/3경 50통 누적 → 5/10 최종 판정.
- **열람율 추적 구현** (보류): Teddy "추후 수정" 결정. 재개 시 권장안 B — "관심 클릭율" KPI 카드 (이미 구현된 PR13 click_events 기반, 열람율보다 신뢰성 우위).

## 원래 v3 PR18에서 폐기된 것

- "스팸 자동 재생성 MAX_REGEN=2 루프" — 배치 자동 초안 경로가 있을 때만 유효. 수동 경로에서는 사용자가 저장 시 validate-draft 1회 호출 → flag이면 본인이 다듬어 재저장. 재생성 자동 루프 불필요.
- generate-draft BODY FORMAT(문단 빈 줄 2칸) + `normalizeParagraphs` 후처리 — 필요성 판단은 실측 후로 보류.

## 다음 세션 진입점

1. 이 파일 먼저 Read (자동 로드됨)
2. 남은 단계 체크리스트 (Teddy 본인 액션 중심):
   - [ ] Typology / Trinny London draft 재생성 — Buyers DB 메일 버튼 → 바이어 인텔 탭 → 국문 초안 생성 → 영문 반영 및 검증 (각 1~2분)
   - [ ] PR0 재측정 — Teddy 자기 앞 테스트 발송 2~3통 → Primary 5/5 확인
   - [ ] **4/25(토) 1차 5~10통 실전 발송**
   - [ ] 4/27 ~ 5/3 매일 5~10통 누적 → 5/3 전 **50통**
   - [ ] 5/7(목) 중간 체크 — ③+ 회신 0건이면 조기 폐기 검토
   - [ ] 5/10(일) 최종 판정
3. Teddy 첫 멘트 예상:
   - **"오늘 N통 발송, 누적 M통"** → project_sps_sprint04.md 에 일자별 누적 기록
   - **"X사에서 회신 왔어, ③+"** → 회신 기록에 추가
   - **"Primary N/5 였어"** → 전달률 실측 기록
   - **"자기 앞 테스트"** / **"기존 draft 재생성"** / **"1차 발송 시작"** → 해당 단계 지원
4. Edge Function 재배포 누락 교훈: 코드 커밋 ≠ prod 반영. 다음에 프롬프트/Edge Function 수정 시 반드시 `npx supabase functions deploy` 확인 + DB 실측 교차 검증 (feedback_verify_before_report.md)

## 발송 경과 로그 (5/10 판정용 누적 데이터)

일자별 발송량 / Primary 율 / 회신 / 루브릭 집계는 아래 공간에 누적 기록.

| 날짜 | 발송량 | 누적 | Primary | 회신 | 루브릭 ③+ | 비고 |
|---|---|---|---|---|---|---|
| _4/25 이후 기록 시작_ | | | | | | |
