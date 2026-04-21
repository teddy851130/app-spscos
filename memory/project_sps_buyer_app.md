---
name: Project - SPS 바이어 앱 현재 상태
description: SPS 바이어 발굴 웹앱의 현재 단계·최근 완료 항목·진행 중 스프린트 요약. 새 세션 시 작업 범위 잡을 때 여기부터 확인
type: project
originSessionId: 21a63ab3-e127-4fd4-a0d3-c51593fa444c
---
## 현재 단계 (2026-04-22 새벽 기준)

**Sprint04 Day 3 종료.** 4/22 오전 Teddy 실사용 피드백(9가지) 제기 → 심야까지 전부 fix 배포 (7커밋 + Edge Function 4개 재배포 + DB migration 1건). 최대 발견: **PR17/18/19 커밋은 main 에 있었지만 Supabase Edge Function 재배포 누락으로 Teddy가 본 메일은 PR17 이전 프롬프트 결과**. 이후 추가 버그 fix (Rare Beauty 다중 발송 = per-contact tracking 전환, 가독성·개인화·스팸 비결정성, 최신순 필터, EmailComposeModal 탭 순서). **현재 상태 상세는 `project_sps_sprint04.md`**.

**다음 세션 첫 액션**: (1) 기존 DB draft 2개(Typology/Trinny London) 재생성 · (2) PR0 재측정 (Teddy 자기 앞 2~3통) · (3) 4/25(토) 1차 5~10통 실전 발송.

**남은 블로커 / 대기**:
1. **기존 DB draft 재생성** — Teddy가 EmailComposeModal 에서 "영문 반영 및 검증" 재클릭 필요 (Typology/Trinny London). REFY 는 4/22 실측 중 재생성 완료.
2. **PR0 재측정** — 토 오전 필수. Primary < 5/5면 외부 발송 연기.
3. **열람율 추적** — Teddy "추후 수정" 결정. 재개 시 권장안 B (클릭율 KPI 카드).
4. **통합 웹사이트 런칭** — 별도 프로젝트.

## 최근 완료 (PR6 ~ PR18)

- **PR6 ~ PR8**: 발송 가드 3겹 + validate-draft 즉시 검증 + backgroundTask 크래시 보호 + BATCH_SIZE=5 + legacy-archive 통합 (ADR-014~020).
- **Sprint03 (PR9~PR12)**: 직원 D 프롬프트 재설계(CIA+Challenger+Warm-Confident) + Perplexity 바이어 인텔 웹 검색 + SPAM_WORDS 35개 확장 + bounce 정책 명문화 (ADR-021~031).
- **PR13** (2026-04-17 배포 + 2026-04-19 hotfix/검증): 클릭 추적 redirect `/go/[token]` + Pipedrive Activity 자동 등록 + 대시보드 위젯 (ADR-032). 커밋 `e4ff31e` + hotfix `c5a65c7`.
- **PR14** (2026-04-19): email_drafts.spam_reason 컬럼 + Dashboard/MailQueue 사유 노출 (ADR-033). 커밋 `c6ff14d`.
- **ADR-034** (2026-04-19): 스팸 점수 라벨 "안전도"로 통일 + 로컬 체크 엄격화(이슈 1+ → score≤5) + 편집 진입 시 DB 점수 보존. 커밋 `f758992`.
- **PR15** (2026-04-19): EmailComposeModal 첨부 파일 업로드 실제 구현 (base64 inline, 총 4MB) (ADR-035). 커밋 `72cd756`.
- **통합웹사이트.md** (2026-04-19): 별도 프로젝트 시작 시 참조할 핸드오프 문서. 커밋 `84412fd`.
- **PR16** (2026-04-21 배포, 코드 커밋 `d93076b`): Perplexity 401 분리 + agentC status reset + agentD/E team 필터 + Emails.tsx 폴백 엄격화 (ADR-036~039). SQL 사전점검 0건(데이터 자연 해소) → 코드만 배포.
- **PR17** (2026-04-21, `f5616b9`, ADR-043): MailQueue buyer_contacts JOIN per-contact flatten + HARD LIMITS 7건 + SPAM_WORDS 35→50 + `Donghwan Shin`→`Teddy Shin`.
- **PR17.1** (2026-04-21, `2864609`, ADR-044): 콜드메일 서명 5줄 블록(Managing Director + Email/Web/Mobile + 등록 주소) + MAX_WORDS 150→180.
- **PR17.2** (2026-04-21, `5d99f93`, ADR-045): "오늘 보낼 메일" 페이지 완전 제거(-775줄). Dashboard에 팔로업 기능 + EmailComposeModal 직접 통합.
- **PR18** (2026-04-21, `fe6604e`, ADR-046): run-pipeline agentD/E 완전 삭제(배치 자동 초안 경로 폐기) + Dashboard 초안 목록 3개 섹션 제거. 파이프라인 B→C→F 3단계로 슬림화.
- **PR19** (2026-04-21, `976b3c2`, ADR-047): Buyers + Dashboard 팔로업 섹션 "메일 작성" 버튼을 email_count 기반 5단계 컬러 계단으로 교체. 0=첫 발송/회색, 1=1차/노랑, 2=2차/녹색, 3=3차/빨강, ≥4="보관"/빨강+disabled. DB 변경 없음.
- **PR21-Docs + PR22-Lite** (2026-04-21, `135b001`, ADR-048): `docs/agents/` 신규 디렉토리에 직원 A~F 스펙 md 6개(중간 분량). AGENTS.md 인덱스 추가. Pipeline.tsx CSV 스킵 사유 6종 UI 노출. reference_sps_infra.md 에 도메인 중복 체크 SQL 병기. agent_d/e.md 는 배치 삭제된 agentD/E 대신 generate-draft/validate-draft 수동 경로로 재정의.
- **4/22 실사용 피드백 fix 7커밋** (`3fcfa80` / `b03130e` / `0f0a68c` / `a9b1fcc` / `0810f75` / `5d65b65`): Edge Function 3개 재배포 + Pipeline D/E 제거 + 열람율 카드 제거 + CEO→Managing Director + SPAM_WORDS 정리 + per-contact tracking 전환(DB migration `per_contact_email_tracking`) + 최신순 필터 + EmailComposeModal 탭 순서 + 가독성/개인화/스팸 비결정성. 실측 검증으로 Marie Duhamel draft: Hi there/flag 7점 → Hi Marie/pass 9점 문단 5개 구성.

## 오늘 해결된 이슈 (2026-04-19)

| 이슈 | 해결 |
|------|------|
| PR13 tracking URL이 `app-spscos.vercel.app/go`로 하드코딩돼 응답 불가 | `app.spscos.com/go`로 정정 (3개 Edge Function + 코멘트 동기화) |
| agentE flag 사유가 pipeline_logs에만 남아 UI에서 확인 불가 | PR14로 email_drafts.spam_reason 컬럼 + Dashboard/MailQueue 노출 |
| 스팸 "수정" 버튼 → "위험 낮음" 자기모순 + 라벨 혼동 | ADR-034로 통일·엄격화 |
| 메일 모달 하드코딩 PDF 더미 | 제거 + 실제 업로드 구현 (PR15) |
| Pipedrive API 토큰 Vercel env 누락 | Teddy 수동 등록 완료, 작동 확인 |
| 429 레이트 리밋 간헐 발생 | Anthropic 선불 크레딧 충전 → Tier 2 대기 중 |

## 불필요 판정 (Teddy 결정)

- 초안 영문/국문 혼재 UI 버그 — Teddy가 불필요하다고 명시. 실전 사용 시 문제되면 재평가.

---

## 🚀 다음 세션 시작 플랜 (Teddy 합의 2026-04-20 종료 시점)

### 첫 멘트 예상: **"전체 수정 내용 알려줄게"** 또는 비슷한 PR16 fix 요청

### 다음 세션 Claude 사전 작업
1. `project_sps_pipeline_bugs.md` 먼저 읽기 — 4개 버그 + Fix 후보 (PR16-A~E)
2. Teddy가 공유하는 수정 내용을 받아 PR16 우선순위 재정리
3. Edge Function 재배포는 prod 영향 → 명시 승인 후 진행

### 자동 발굴 사이클 (확립됨)
- Apollo MCP로 회사 → People search → people_match enrich
- **사전 중복 점검 필수** (`feedback_buyer_dedup_check.md`): 회사 후보 선정 직후 Supabase buyers 도메인 SELECT로 중복 사전 제거
- CSV는 프로젝트 폴더에 저장 (`feedback_file_save_location.md`), `.gitignore`에 `sps_buyers_*.csv` 등록됨

### 발송 시점 (이전 논의 재확인)
- **초안 생성까지는 URL 노출 없음** → 지금 바로 쌓아도 OK
- **실제 발송**은 별도 결정:
  - A안(권장): 통합 사이트 런칭 후 URL 전환 완료 시점
  - B안: 우호 바이어 5~10명 대상 소규모 테스트 먼저
  - C안(권장 X): 전면 발송 강행

### MCP 도구 확인됨 (다음 세션에 바로 활용)
- `mcp__claude_ai_Apollo_io__apollo_mixed_companies_search` / `apollo_contacts_search` / `apollo_organizations_enrich` / 외
- `mcp__claude_ai_Clay__find-and-enrich-company` / `find-and-enrich-contacts-at-company` / 외
- 신규 워크플로: 기존엔 Teddy가 Clay/Apollo 화면 직접 조작 → 이제 Claude가 MCP로 직접 발굴 가능

## 미해결 이슈 (별도 처리)

- "오늘 보낼 메일" 회사 미상 표시 — Sprint03 회고에서 데이터 자연 해소 확인됨
- 초안 영문/국문 혼재 (UI 버그)
- 스팸 "수정" 버튼 → "위험 낮음" 반환 (validate-draft 로직)
- 429 경고 간헐 발생 (Claude API 할당량, Tier 2 승격 대기)

## 주요 참조

- `docs/DECISIONS.md` — ADR-001~032
- `sprints/Sprint03_Plan.md` — 완료
- `supabase/functions/run-pipeline/index.ts` — 직원 C/D/E/F 실제 코드
- `supabase/functions/generate-draft/index.ts` — EmailComposeModal 국문 초안 경로
- `app/go/[token]/route.ts` — PR13 클릭 추적 엔드포인트
