@AGENTS.md

# SPS International 바이어 발굴 웹앱

> 새 세션의 Claude는 이 파일을 자동 로드함. 프로젝트 전체 맥락을 여기서 파악 후 작업 시작.
> 더 깊은 내용은 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DECISIONS.md](docs/DECISIONS.md), [docs/RUNBOOK.md](docs/RUNBOOK.md) 참조.

---

## 사업 컨텍스트

- 한국 화장품 OEM/ODM 중개회사 SPS International
- 해외 바이어 발굴 → 초개인화 콜드 메일 발송 플랫폼
- CEO: 신동환 (teddy@spscos.com) — 비개발자
- **MOQ**: 3,000개 이상
- **Tier**: 1 (매출 $50M+, 500명+), 2 ($5M~$50M, 50~500명), 3 (저장만, 발송 제외)
- **지역**: GCC / USA / Europe (UK+France+Germany)
- **BCC**: `spscos@pipedrivemail.com` (Pipedrive 자동 연동)

---

## 기술 스택

- Next.js 14 App Router + React 19 + TypeScript 5
- Tailwind CSS 4
- Supabase (DB + Auth + Edge Functions Deno)
- **nodemailer@6.9.16** (Gmail SMTP — denomailer 금지)
- Vercel 배포 (GitHub main push 시 자동)

---

## 직원(에이전트) 파이프라인

- **직원 A**: 바이어 발굴 → CSV 업로드(Clay/Apollo)로 대체
- **직원 B**: ZeroBounce 이메일 유효성 검증
- **직원 C**: Claude 기업 분석 → `recent_news` + `intel_score`
- **직원 D**: Claude 영문 초안 작성 → `email_drafts`
- **직원 E**: 스팸 검증 (규칙 + Claude) → `spam_status`
- **직원 F**: 시스템 모니터링 + 경고 생성

---

## 명령어

```bash
# 개발 서버 (port 3000)
npm run dev

# 빌드
npm run build

# 타입체크 (PR 제출 전 필수)
npx tsc --noEmit

# Playwright 테스트 (port 3333)
npx playwright test
```

---

## 절대 하지 마 (Do-Not)

- ❌ `.env.local` 수정 금지
- ❌ Production DB에 migration 직접 실행 금지 — **사전 점검 SQL 먼저** 실행
- ❌ Edge Function 배포 시 `denomailer` 사용 금지 → **`npm:nodemailer@6.9.16`** 사용
- ❌ `buyers.status`에 한국어 직접 저장 금지 — DB는 영어 enum, UI만 한국어 (`mapStatus` 경유)
- ❌ 하드코딩 영문/국문 메일 템플릿 재도입 금지 (ADR-005에서 삭제, 인텔 기반 초안만 허용)
- ❌ `supabase.functions.invoke` 사용 금지 — direct fetch (ADR-009)
- ❌ 포괄 RLS 정책 DROP 시 SELECT/INSERT/UPDATE 개별 재생성 확인 (ADR-008 교훈)

---

## 배포 순서 (PR마다)

[RUNBOOK.md](docs/RUNBOOK.md) 참조. 요약:

1. `npx tsc --noEmit` 통과 확인
2. GitHub main push → Vercel 자동 배포 (2~3분)
3. (Supabase 변경) Dashboard SQL Editor에서 migration 실행 + 사전 점검
4. (컬럼 추가/제거 시) `NOTIFY pgrst, 'reload schema';`
5. (Edge Function 변경) Dashboard → Functions 재배포
6. 체크리스트 검증

---

## 주요 도메인 규칙

- **스팸 점수 스케일**: **10=안전, 1=위험** (ADR-001, 방향 혼동 주의)
  - UI 색상: ≥8 초록, 5~7 주황, <5 빨강
- **인텔 품질 임계값**: **60점**. 미달 시 `status='intel_failed'` 마킹 → 발송 제외 (ADR-006)
- **팔로업 간격**: Tier1=5일, Tier2=7일
- **CSV 1기업당 최대 담당자**: 3명 (ICP 직함 필터 필수)
- **초안 생성 단일 경로**: `EmailComposeModal` "바이어 인텔" 탭만 (ADR-007)

---

## 세션 관리

### 새 세션 시작 시 (Claude)
1. 이 CLAUDE.md 자동 로드됨
2. `~/.claude/projects/.../memory/MEMORY.md` 자동 로드됨
3. 사용자 첫 질문 전에 필요 시 `git log --oneline -10` 으로 최근 작업 확인

### 세션 종료 전 (사용자가 요청)
"오늘 결정·진행 상황 memory에 저장해줘" 한 줄이면 Claude가 자동으로:
1. 주요 결정 → `docs/DECISIONS.md` (레포)
2. 진행 중 작업 → `memory/project_sps_buyer_app.md` (메모리)
3. 이월 항목 → `memory/project_sps_pr6_deferred.md` or `project_sps_agent_queue.md`
4. `MEMORY.md` 인덱스 업데이트

---

## 참고 문서

### 레포 내 (코드와 함께 버전 관리)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — 시스템 구조
- [docs/DECISIONS.md](docs/DECISIONS.md) — ADR 목록 (설계 결정)
- [docs/RUNBOOK.md](docs/RUNBOOK.md) — 배포·롤백·트러블슈팅
- [sprints/](sprints/) — 스프린트 계획·리포트

### 메모리 (세션 간 동적 상태)
- `memory/MEMORY.md` — 인덱스
- `memory/project_sps_buyer_app.md` — 현재 진행 상황
- `memory/project_sps_pr6_deferred.md` — PR6 이월 UI 항목
- `memory/project_sps_agent_queue.md` — PR7 에이전트 큐 재설계
- `memory/reference_sps_infra.md` — Supabase/GitHub/Vercel 좌표
- `memory/reference_sps_team.md` — SPS 팀원 정보
