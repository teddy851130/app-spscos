# Sprint04 새 세션 진입 트리거

> 이 파일 하나로 **내일 새 세션에서 즉시 이어 일하기** 위한 단일 진입점.
> Claude가 세션 시작 시 이 파일을 먼저 Read하면 현재 상태·다음 액션 30초 안에 파악 가능.
>
> 작성: 2026-04-20 (월) 18:00 · 다음 세션 기대일: 2026-04-21 (화) 오전

---

## Teddy에게 첫 멘트 제안

> **"어제 PR16 완료된 거 배포하고 PR17 시작하자."**

또는 더 짧게:

> **"/ 이어서"**

---

## 현재 상태 요약 (30초)

- **Generator/Evaluator 루프**: v1(84) → v2(93) → v3(96). **v3 확정**.
- **PR16 코드**: fix 5건 커밋 완료 · `npx tsc --noEmit` 통과 · **prod 배포 대기**
- **SQL 스크립트**: `supabase/migrations/PR16_cleanup.sql` 5단계 준비 완료
- **PR0**: 4/20 1차 측정 Primary 4/5 (80%). 경계 판정. PR18 후 재측정 필수.
- **일정**: 4/21 화 = PR16 배포 + PR17 착수. 5/10 일 = 최종 판정.

---

## 새 세션 시작 시 Claude 자동 작업 순서

### Step 1 — 컨텍스트 복원 (1분)
병렬 Read:
- `memory/MEMORY.md` (자동 로드됨)
- `memory/project_sps_sprint04.md` — 현재 상태 상세
- `sprints/Sprint04_Plan_v3.md` — 확정 플랜 (96점)
- `docs/PR0_Delivery_Check.md` — 발송 인프라 현황

### Step 2 — 첫 확인 질문 (Teddy에게)
1. "PR16 배포 진행할까? Supabase Dashboard SQL Editor 접속 상태?"
2. "PR0 자기 앞 재측정은 PR18 이후로 잡아뒀는데, PR16 배포 후 바로 PR17 들어갈까?"

### Step 3 — PR16 배포 프로시저 (Teddy 승인 후)

Teddy가 "go" 하면 아래 순서로 안내 + 실행:

#### 3-A. DB 정리 (Teddy가 Supabase Dashboard에서 직접 실행)
1. `supabase/migrations/PR16_cleanup.sql` 열어서 **① 사전 점검** 블록만 복사 → SQL Editor 실행
2. 결과 target_count 확인 → Claude에게 숫자 공유
3. Claude 판단:
   - 3~10건: 정상. ②③④ 순차 실행 안내
   - 0건: 이미 정리된 상태. ②③ 건너뛰고 대신 새 migration 실행 않음
   - 수십+ 건: 원인 재확인 (다른 버그 가능성)

#### 3-B. 코드 배포
1. 이미 커밋됨 → GitHub main push만 하면 Vercel 자동 배포
2. Edge Function `run-pipeline` 재배포: Supabase Dashboard → Functions → Deploy
   - **`npm:nodemailer@6.9.16` 유지** (ADR-016, denomailer 금지)
3. 배포 후 Teddy가 파이프라인 1회 실행 → `pipeline_logs`에서 직원D/E 완료 건수가 team별로 분리됐는지 확인

#### 3-C. 검증 (Teddy가 UI로 확인)
- Emails 페이지: 상태가 email_logs와 일치하는지 (이전 오표시 해소)
- Dashboard 직원C 완료 로그에 "intel_failed" 합계가 이전보다 줄었는지

### Step 4 — PR17 착수 (같은 날)

`sprints/Sprint04_Plan_v3.md` PR17 섹션 참조. 3체크박스 수정:
- (a) `EmailComposeModal.tsx` L718 `Donghwan Shin` → `Teddy Shin`
- (b) `run-pipeline/index.ts` agentD L660 SIGN-OFF `"Teddy"` → `"Teddy Shin"` + L685/L686 body description
- (c) `generate-draft/index.ts` translate_save 프롬프트 L224-L246에 `SIGN-OFF RULE:` 섹션 신규 추가
- 추가: `MailQueue.tsx` L162-L220 fetchFollowups를 `buyer_contacts` JOIN 기반으로 전면 재작성 (담당자 3명 합침 버그 근본 해결)
- 추가: agentD 프롬프트 L662 P.S. 추적 URL을 본문 중간 자연 삽입으로 변경

---

## 위험 체크포인트

### PR16 배포 위험 (낮음)
- Edge Function 배포 1회 실패 시 이전 버전으로 즉시 롤백 (Supabase Functions 히스토리에서 이전 배포 선택)
- SQL migration 실수 시 `PR16_cleanup.sql` ⑤ 롤백 블록 실행 (buyers_intel_recovery_20260420 백업 테이블 존재 시)

### PR17 위험 (중간)
- MailQueue 쿼리 재작성이 팔로업 큐를 비어 보이게 할 regression 가능 → Rara Beauty(3명) 테스트 케이스 2개 필수
  - ① 3명 모두 미발송
  - ② 2명 발송 / 1명 미발송
- 서명 수정 3곳 누락 시 본문·UI 일관성 깨짐 → 체크박스 3개 전부 완료 확인

### 배포 승인 원칙
- **prod 배포는 Teddy 명시 승인 후에만** (feedback_deploy_authorization.md)
- Teddy가 퇴근·부재 상황이면 코드·SQL·docs만 준비 후 대기

---

## 참고 지표

### 성공 기준 (v3 플랜 §1-2)
- 1차: 5~10통 발송 중 루브릭 ③ 이상 회신 1건 (자동응답 제외)
- 2차: 50통 누적 + 1주일 후 회신 수치 측정 → 5/10(일) 최종 판정
- 중간 체크: 5/7(목) ③+ 0건이면 조기 폐기 검토

### 폐기 판단 2중 트리거
- ① click_events 0건 + Gmail 수신함 회신 0건
- ② 루브릭 ③ 이상 0건

---

## 주요 파일 좌표

### 이 세션 산출물
- `sprints/Sprint04_Plan_v{1,2,3}.md` · `Sprint04_Review_v{1,2,3}.md`
- `sprints/Sprint04_NextSession.md` ← **이 파일**
- `supabase/migrations/PR16_cleanup.sql`
- `docs/PR0_Delivery_Check.md`
- `docs/DECISIONS.md` (ADR-036 ~ ADR-039 추가)
- `memory/project_sps_sprint04.md`

### 코드 수정 (PR16 배포 대상)
- `supabase/functions/run-pipeline/index.ts` (Perplexity 401 분리 + agentC status reset + agentD/E team 필터)
- `app/components/Emails.tsx` (폴백 엄격화)

### Teddy 운영 문서
- `docs/RUNBOOK.md` — 배포·롤백 절차
- `memory/reference_sps_infra.md` — Supabase/Vercel/GitHub 좌표
