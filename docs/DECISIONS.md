# 아키텍처 결정 기록 (ADR)

> 주요 설계 결정을 날짜순 기록. "왜 이렇게 했지?" 질문 시 여기부터 확인.
> 새 결정 시 맨 아래에 ADR-XXX 번호로 추가.

---

## ADR-001: 스팸 점수 스케일 "10=안전, 1=위험"
**날짜**: 2026-04-15 (PR1)
**결정**: DB의 `spam_score` 컬럼은 높을수록 안전한 스케일.
**이유**: 직원 E(run-pipeline)가 Claude에게 "Rate spam risk 1-10 (10=safe)" 프롬프트로 질의 → 이 값을 그대로 저장. UI 전체에서 일관 해석하기 위해 모든 표시 코드(MailQueue, Dashboard)를 이 스케일에 맞춤.
**대안 기각**: "1=안전, 10=위험" 역방향 — DB 값 대량 변환 필요, 서버 측 Claude 프롬프트도 같이 바꿔야 하므로 비용 큼.
**관련**: PR1, `app/lib/enumMap.ts` `spamLevel()`

---

## ADR-002: 미발송 초안 중복 방지 — 부분 UNIQUE 인덱스
**날짜**: 2026-04-15 (PR1)
**결정**: `email_drafts`에 `UNIQUE (buyer_contact_id) WHERE is_sent = FALSE` 부분 인덱스.
**이유**: 미발송 초안은 컨택트당 1개만 유지 (중복 생성 방지). 발송 완료된 초안은 히스토리로 여러 건 가능해야 하므로 전체 UNIQUE는 부적합.
**관련**: migration 008

---

## ADR-003: email_count 원자적 RPC
**날짜**: 2026-04-15 (PR1)
**결정**: `increment_email_sent()` PostgreSQL function으로 email_count/status/last_sent_at을 원자적 UPDATE.
**이유**: 이전 SELECT→UPDATE 2단계는 동시 발송 시 race condition → 카운트 누락 가능. RPC 한 문장으로 해결. P0002 존재 검증도 포함.
**관련**: migration 008, send-email Edge Function

---

## ADR-004: CSV 업로드 단일 경로 (Pipeline 페이지)
**날짜**: 2026-04-16 (PR2)
**결정**: 우측 상단 "+ CSV 업로드" 버튼은 Pipeline 페이지로 네비게이트만. 구식 CSVUploadModal 삭제.
**이유**: 두 경로(모달 구식 + Pipeline 신식)가 컬럼 매핑 일관성 파괴. Pipeline 드래그존이 더 풍부한 필드 지원(ICP 직함 필터, 담당자 최대 3명, N+1 배치 쿼리 등).
**관련**: PR2, `CSVUploadModal.tsx` 삭제

---

## ADR-005: 하드코딩 메일 템플릿 완전 삭제
**날짜**: 2026-04-16 (PR5)
**결정**: `EmailComposeModal`의 `englishEmailTemplate` / `koreanEmailTemplate` / `applyAIPreset` / `regenerateWithIntel` 전부 제거. 인텔 기반 초안만 발송 가능.
**이유**: 대표님 방침 "인텔 없으면 메일 못 보내도 OK. 초개인화만 발송." 하드코딩 폴백이 있으면 품질 무관하게 메일 나감. 브랜드/도메인 평판 보호.
**결과**: 인텔 없는 바이어 → 발송 버튼 disabled + "바이어 인텔이 없어 발송할 수 없습니다" 경고 배너.
**관련**: PR5, `EmailComposeModal.tsx`

---

## ADR-006: 인텔 품질 게이트 (임계값 60)
**날짜**: 2026-04-16 (PR4)
**결정**: 직원 C가 생성한 recent_news를 4필드 기반 0~100 채점. 60점 미달 시 재시도 1회. 재시도 후에도 미달이면 `status='intel_failed'` 마킹 + `analysis_failed_at` 기록.
**4필드**: company_status / kbeauty_interest / recommended_formula / proposal_angle
**채점**: 필드 중 하나라도 0점이면 전체 0점 (필드 누락 우회 차단).
**이유**: (1) 무한 재분석 루프 방지 (2) 저품질 인텔로 발송 차단.
**대안 기각**: 임계값 50 — 너무 느슨, 낮은 품질 통과 위험.
**관련**: migration 009, run-pipeline agentC, `computeIntelScore()`

---

## ADR-007: 초안 생성 단일 경로 (EmailComposeModal)
**날짜**: 2026-04-16 (PR5.3)
**결정**: `BuyerIntelDrawer`에서 국문 초안 생성 UI 제거. 오직 `EmailComposeModal` "바이어 인텔" 탭에서만 생성.
**이유**: 대표님 지시 "초안 생성은 첫 메일 클릭 경로에만". 코드 중복 해소 + 멘탈 모델 단일화.
**결과**: Drawer는 인텔 검토·담당자 관리 전용. 초안 생성은 "메일 작성" 버튼 → 모달로.
**관련**: PR5.3, `BuyerIntelDrawer.tsx`, `EmailComposeModal.tsx`

---

## ADR-008: buyer_contacts SELECT RLS 복원
**날짜**: 2026-04-16 (hotfix 010)
**결정**: migration 007이 실수로 buyer_contacts의 "Allow all buyer_contacts" 단일 정책을 DROP하면서 SELECT 정책까지 사라짐 → 복원.
**이유**: 프론트에서 담당자 조회 불가 → 바이어 DB + BuyerIntelDrawer에 담당자 정보 전부 빈 상태. 다른 테이블과 일관성(모두 SELECT 공개).
**교훈**: 포괄 정책 DROP 시 해당 액션별(SELECT/INSERT/UPDATE) 정책이 모두 사라짐을 인식. 나중에 RLS 설계 시 액션별 분리 정책 권장.
**관련**: migration 010

---

## ADR-009: supabase.functions.invoke → direct fetch 전환
**날짜**: 2026-04-16 (PR2, PR5, PR5.3)
**결정**: Edge Function 호출 시 `supabase.functions.invoke()` 대신 직접 `fetch()` 사용.
**이유**: invoke가 non-2xx 응답 본문을 버려 "Edge Function returned a non-2xx status code"라는 일반 오류만 노출 → 진단 불가. 직접 fetch로 `data.error` 실제 메시지 노출.
**적용 경로**: send-email, generate-draft의 translate_only / generate_ko / translate_save.
**관련**: `EmailComposeModal.tsx` handleSend / applyKoToEn / handleGenerateKo / handleTranslateAndSave

---

## ADR-010: Edge Function 호출 시 anon key 사용 (세션 JWT 아님)
**날짜**: 2026-04-15 (기존 프로젝트 패턴 명문화)
**결정**: 프론트에서 Edge Function 호출 시 Authorization 헤더에 anon key 사용 (로그인 세션 JWT 아님).
**이유**: 세션 JWT는 만료 시 401 발생 → 불안정. Edge Function 내부는 service_role로 DB 접근 (auth.uid 의존 안 함). anon key 고정이 안정적.
**대안 기각**: 세션 JWT 사용 — 자동 갱신 실패 시 401 경로가 발견되기 어려워 운영 리스크.
**관련**: `app/lib/supabase.ts` `invokePipeline()`, 모든 direct fetch 호출

---

## ADR-011: 파이프라인 10분 타임아웃 + 재시도 UI
**날짜**: 2026-04-16 (PR3)
**결정**: 클라이언트 폴링이 10분 이상 running/pending 상태면 "응답 없음" 배지 + "재시도" 버튼 노출. 재시도 시 옛 job을 명시적 `status='failed'` + `error_log='사용자가 재시도하여 중단됨'`으로 잠그고 새 job 생성.
**이유**: Edge Function 타임아웃 또는 finally 블록 미실행 시 "실행 중" 영구 고착 방지. 옛 job 지연 완료 시 race condition도 잠금으로 차단.
**관련**: PR3, `Pipeline.tsx` `handleRetryTeam()`, `timedOutJobIdsRef`

---

## ADR-012: 한글 혼입 가드 (직원 D)
**날짜**: 2026-04-15 (PR1)
**결정**: 직원 D가 Claude에게 영문 메일만 생성하라고 지시했음에도 한글이 섞여 반환된 경우, 정규식 `[\u3131-\uD79D\u4E00-\u9FFF]`로 감지해 저장 스킵 (`pendingIntel++`로 카운트만).
**이유**: 과거 "국영 혼영" 버그. 도메인 평판 보호를 위해 영문만 DB 저장.
**관련**: run-pipeline agentD

---

## ADR-013: 영구 문서 + Claude Code 프로젝트 설정 인프라
**날짜**: 2026-04-16 (세션 간 인수인계 개선)
**결정**:
1. **레포 영구 문서 3종** (`docs/ARCHITECTURE.md` · `docs/DECISIONS.md` · `docs/RUNBOOK.md`) 신설. 코드와 함께 버전 관리.
2. **프로젝트 `CLAUDE.md` 확장** — 사업/스택/Do-Not/배포/도메인 규칙을 한 파일에서 자동 로드.
3. **`.mcp.json`** — Supabase MCP 서버를 프로젝트 scope로 정의 (project_ref=hoerrdwupqhmqyyvwefg). 토큰은 `SUPABASE_ACCESS_TOKEN` 환경변수에서 주입 (하드코딩 금지).
4. **`.claude/settings.json`** — `PreCompact` 훅(memory 저장 리마인더) + `SessionStart` 훅(세션 시작 안내) + MCP 자동 승인.

**이유**:
- 세션 간 인수인계 사건 발생 (2026-04-16 새 세션 Claude가 "PR7 큐 재설계 본 작업 범위 어디 있나요?" 질문). 원인: 초기 세션 대화 본문에만 기록하고 영구 저장 누락.
- **영구 지식 = 레포 `docs/`**, **동적 상태 = `memory/`** 원칙 정립.
- 프로젝트별 Claude Code 설정(`<project>/.claude/`, `<project>/.mcp.json`)은 자연스럽게 프로젝트 scope로 격리됨 → 다른 프로젝트에 영향 없음.

**대안 기각**: Memory 파일에만 기록 — 세션 간 유지되지만 팀에 공유 안 되고 대표님 PC 의존. 레포 문서가 더 신뢰 가능.

**결과**:
- 새 세션에서 Claude가 즉시 맥락 파악 (CLAUDE.md 자동 로드 + docs 참조)
- 다른 PC에서도 동일 설정 자동 적용 (레포 clone 시)
- 세션 종료 전 습관: "오늘 결정 memory와 docs에 저장해줘" 한 문장

**관련**: 커밋 `cbeb34d` (docs 신설), `8d4aada` (MCP + 훅)

---

## ADR-014: PR6 발송 가드 3겹 + 즉시 검증 Edge Function
**날짜**: 2026-04-16 (PR6 메인 + hotfix 6.1~6.4)
**결정**: EmailComposeModal 발송 경로에 가드를 3겹으로 쌓고, 파이프라인 대기 없이 즉시 스팸 검증이 가능하도록 `validate-draft` Edge Function 신설.
- **가드 1 (PR6.1)**: `draftExists && draftSpamStatus !== 'pass' && !== 'rewrite'` → 검증 미통과 초안 발송 차단. `spam_status=null` 또는 `'flag'` 상태에서 발송 버튼 disabled.
- **가드 2 (PR6.2)**: `draftDirty` — textarea 편집본이 DB에 반영 안 된 상태면 발송 차단. "초안 저장" 먼저 요구. 원본 캐시(`draftSubjectOriginal`/`draftBodyOriginal`)로 편집 감지.
- **가드 3**: 기존 빈값 체크 `!subject.trim() || !emailBody.trim()`.
- **validate-draft Edge Function (PR6.3)**: 단일 `draft_id`에 대해 `checkSpamRules` + `autoFixSpam` + Claude 점수 질의 → `pass`/`rewrite`/`flag` 판정 + DB UPDATE. 기존 `run-pipeline.agentE` 헬퍼를 복사(중복). PR7에서 agent-e 분리 시 공용 모듈로 통합 예정.
- **통합 경로 (PR6.4)**: 바이어 인텔 탭의 "영문에 반영 및 검증" 버튼이 `translate_save` 성공 직후 `validate-draft` 자동 호출. 국문 수정 후 파이프라인 대기 없이 원샷 완료. 영문 탭의 "저장 및 재검증" 버튼도 동일 로직 (draftValidationPending일 때도 활성화).

**이유**:
- PR5까지: textarea 편집본은 DB 반영 안 됨 → 검증 안 된 수정본이 그대로 발송될 수 있던 구조적 구멍 (Teddy 지적).
- 파이프라인 다음 실행까지 기다려야 검증 완료 → 실전 사용 마찰 심각.
**대안 기각**:
- A. 발송 시 서버측 재검증: 네트워크 1회 더 + 사용자가 결과 못 봄 → 실패 시 혼란.
- B. agentE 공용 모듈 선행 추출 (PR7 일부 차용): run-pipeline까지 건드려야 → scope 확장.
**관련**: PR6 커밋 `7885fe1`, `a08fafc`, `b805e0e`, `33dafb9`, `afee809`, `EmailComposeModal.tsx`, `validate-draft/index.ts`

---

## ADR-015: Claude 번역 프롬프트 "2축 분리" (내용 보존 + 스타일 의역)
**날짜**: 2026-04-16 (PR6.5~6.6)
**결정**: `generate-draft` translate_save 프롬프트를 **두 축으로 명시적 분리**:
- **Axis 1 — CONTENT PRESERVATION (strict)**: 모든 문장·클레임·디테일 1:1 번역. Claude가 "부적절"하다고 판단해도 임의 삭제·재구성·병합 금지.
- **Axis 2 — STYLE POLISH (encouraged)**: 비원어민 사용자 대상 → 어휘·어조·flow를 자연스러운 B2B 영어로 의역 허용. 단 의미 변경 금지.

**이유**:
- Teddy가 국문 본문 중간에 "저는 당신을 미워합니다" 삽입 후 "영문에 반영 및 검증" → 이 문장이 번역에서 통째로 누락됨. Claude가 B2B 맥락상 "부적절"로 판단해 자체 제거.
- 처음 PR6.5 수정에서는 "의역 금지" 일변도로 너무 엄격 → Teddy: "영어 유창하지 않아 의역은 필요함". PR6.6에서 두 축을 프롬프트에 분리 명시.
**대안 기각**:
- 번역 엄격화 100%: 비원어민 UX 악화 (어색한 직역체).
- 의역 자유화: 내용 누락 재발 위험.
**관련**: PR6.5 커밋 `785019d`, PR6.6 커밋 `a2f3936`, `generate-draft/index.ts`

---

## ADR-016: autoFixSpam 줄바꿈 보존 (\s → [ \t])
**날짜**: 2026-04-16 (PR6.7)
**결정**: `validate-draft` + `run-pipeline.agentE`의 `autoFixSpam` 함수에서 공백 압축 정규식 `\s{2,}` → `[ \t]{2,}`로 변경.
**이유**: `\s`는 `\n`까지 포함 → 스팸 단어 제거 후 공백 압축 시 문단 구분(빈 줄)·signature 분리까지 단일 공백으로 합쳐버림. rewrite 통과 시 본문이 "텍스트 나열" 상태로 파괴되던 오래된 설계 결함. Teddy 실전 테스트 중 발견.
**영향**: validate-draft + run-pipeline 둘 다 수정 (같은 로직 복사본이므로 양쪽 동기화). PR7 공용 모듈화 시 단일 지점으로 통합.
**관련**: PR6.7 커밋 `ddd9bd0`, `validate-draft/index.ts`, `run-pipeline/index.ts`

---

## ADR-017: 발송 전 UI 정직성 — 하드코딩 측정값 제거, 사용자 체크리스트로 대체
**날짜**: 2026-04-16 (PR6.8)
**결정**:
- **상단 배지 동적화**: `"스팸 점수 85/100 — 안전"` 하드코딩 제거. 실제 `spam_status` + `spam_score`에 따라 pass/rewrite/flag/검증대기중 배지를 조건부 렌더링. 초안 없을 때는 배지 없음.
- **오른쪽 "발송 전 체크" 섹션 재설계**: Gmail 인박스율 / 도메인 평판 / SPF/DKIM 등 실측 불가·비연동 항목 4개 전부 제거. 사용자가 직접 확인해야 할 체크리스트 4개로 교체: 첨부 파일 누락 / 제목·본문 검토 / 중복 발송 / 수신자 이메일 정확성.
- `validate-draft` 응답 확장: flag 시 `issues`(규칙 위반 목록) + `reason`(Claude 한국어 이유) 추가 → 프론트 alert에 표시. Claude 프롬프트를 `{score, reason}` JSON으로 변경.

**이유**:
- 기존 UI는 PR5 프로토타입 당시 "그럴듯하게" 표기한 측정값이 그대로 남아 있었음. 실제 검증과 전혀 연동되지 않아 "초안 작성 전에도 85/100 표시" → misleading.
- flag 경고가 "스팸 위험" 문구만 있고 어느 부분·왜 위험한지 정보 부재 → 사용자가 기준 없이 수정 반복해야 함.
**결과**: 정직한 UX. 배지가 표시되면 실제 검증 결과. 체크리스트는 사용자 직접 확인 항목임을 명확히.
**관련**: PR6.8 커밋 `ea120e5`, `EmailComposeModal.tsx`, `validate-draft/index.ts`

---

## ADR-018: Edge Function backgroundTask try/finally 크래시 보호
**날짜**: 2026-04-17 (PR8 핫픽스)
**결정**: `run-pipeline`의 `backgroundTask` IIFE 전체를 try/catch/finally로 감쌈. finally 블록에서 status='completed' 또는 status='failed'를 DB에 업데이트.
**이유**: 이전에는 backgroundTask 내부에서 예외 발생 시 아무것도 catch하지 않아 `pipeline_jobs.status`가 'running'에 영구 고착됨. 사용자 눈에는 CSV 업로드 후 "실행 중"이 계속 표시. finally는 정상 완료·예외 중단 어느 경우에도 실행되므로 status 업데이트 보장.
**대안 기각**: 각 에이전트 단계별 개별 catch — 중간 단계 크래시 시 finally 체인이 복잡해짐. 최상위 try/finally 하나가 더 단순하고 신뢰 가능.
**관련**: PR8 커밋 `558f7ea`, `supabase/functions/run-pipeline/index.ts`

---

## ADR-019: invokePipeline anon key 직접 fetch (세션 JWT 우회)
**날짜**: 2026-04-17 (PR8 핫픽스)
**결정**: `app/lib/supabase.ts`의 `invokePipeline` 함수를 `supabase.functions.invoke()` → 직접 `fetch()` + anon key 명시로 재구현.
**이유**: `supabase.functions.invoke()`는 현재 로그인 세션의 JWT를 Authorization 헤더에 자동 첨부. 세션이 만료되거나 자동 갱신 실패 시 Edge Function이 401 Unauthorized를 반환해 파이프라인 전체가 pending 고착. anon key를 직접 명시하면 세션 상태와 무관하게 항상 유효.
**참고**: ADR-009(supabase.functions.invoke → direct fetch 전환)의 run-pipeline 적용 버전. ADR-010의 anon key 원칙 재확인.
**관련**: PR8 커밋 `558f7ea`, `app/lib/supabase.ts` `invokePipeline()`

---

## ADR-020: Claude API 429 완화 — 배치 5 + 지수 백오프 재시도 3x
**날짜**: 2026-04-17 (PR8 핫픽스)
**결정**: 
- C/D/E 에이전트 순차 처리 → `BATCH_SIZE=5` 병렬 배치 처리.
- `fetchClaudeWithRetry(maxRetries=3)` 헬퍼 추가: 429 응답 시 `retry-after` 헤더 우선, 없으면 2→5→10s 지수 백오프.
**이유**: 이전에는 C/D/E가 바이어·담당자 1건씩 순차 처리 → 43명 × 10s = 430s로 Edge Function 타임아웃 초과. 병렬 배치 도입 후 3팀 × 배치10 = 30 concurrent Claude 호출 → 429 rate limit 발생. 배치5로 최대 동시 호출 수 절반으로 줄이고 재시도로 429 흡수.
**리스크**: 배치5로도 3팀 동시 실행 시 일부 429 간헐 발생 가능 (완전 제거 아님). Claude API 할당량 업그레이드가 근본 해결.
**대안 기각**: 완전 순차 (배치1) — 타임아웃 재발. 배치10 유지 — 429 과다.
**관련**: PR8 커밋 `558f7ea`, `supabase/functions/run-pipeline/index.ts` `fetchClaudeWithRetry()`

---

## ADR-021: 직원 D 메일 전략 전환 — "제품 추천형" → "문제 제기형 + 리서치 질문형 하이브리드"
**날짜**: 2026-04-17 (Sprint03 착수 결정)
**결정**:
- 기존 `recommended_formula` 필드를 본문에 직접 삽입하는 방식을 폐기.
- 첫 메일 구조를 (1) Opening hook = 바이어 시장의 공급 문제 제기, (2) SPS 케이파빌리티 암시(카테고리 수준, 제품명 미언급), (3) 객관식 CTA(납기/MOQ/기술/인증 중 장애물 선택 요청)로 재설계.
- `SPAM_WORDS` 21개를 프롬프트에 negative constraint로 명시.
**이유**:
- Teddy 지적: "자체 추천 제품 삽입은 무리". B2B 콜드메일 관점에서 첫 메일의 구체 제품 제안은 "이미 결정된 제안"으로 읽혀 거절 신호.
- SPS 실제 차별점 (MOQ 3000 / 8주 납기 / 할랄·오가닉 인증 네트워크)은 "추천"보다 "공급 문제 해소"로 포지셔닝할 때 설득력 상승.
- 리서치 질문형 CTA는 회신 심리 장벽을 낮추는 동시에 자동 qualification 효과.
- PR6.5에서 발견된 스팸 flag 재발 방지 — 생성 단계에서부터 금지어 회피.
**대안 기각**:
- 사례 공유형(Case Study) 단독 — 공개 가능한 성공 사례 DB 부족 (향후 6개월+ 축적 후 재검토).
- 트렌드 공유형 단독 — 지역별 실시간 트렌드 데이터 소스 부재. 하이브리드 구조에 부분 편입은 가능.
- `recommended_formula` 필드 자체 유지 + 본문 삽입만 금지 — agentC 출력 스키마 단순화를 위해 필드 자체를 후속 메일(body_followup)에서만 활용하도록 제한.
**관련**: `supabase/functions/run-pipeline/index.ts` agentD, `supabase/functions/generate-draft/index.ts`, Sprint03 우선순위 1

---

## ADR-022: 직원 C 인텔 웹 검색 데이터 소스 도입 방침
**날짜**: 2026-04-17 (Sprint03 착수 결정)
**결정**:
- 직원 C(바이어 인텔)에 외부 웹 검색 데이터 소스를 도입. 우선순위: (1) 현재 연결된 MCP(firecrawl / context7) 활용성 검토 → (2) Google Workspace MCP(Teddy 유료 계정) → (3) Perplexity API(품질 우위 확인 시). 품질 기준으로 선택, 조합 가능.
- agentC 프롬프트에 검색 결과(최근 뉴스, 공개 재무, LinkedIn 프로필, 제품 라인업)를 컨텍스트로 주입 후 intel 생성.
- rubric 병행 개선: (1) "4필드 중 1개라도 0점 → 전체 0점" 게이트를 "3필드 이상 1점"으로 완화. (2) 길이 기반 이진 배점 → 3구간 연속 배점 + 고유명사(브랜드/제품명) 포함 가중.
**이유**:
- 현재 Claude 학습 데이터(~2024)만 사용 → `recent_news`가 구체 근거 없는 정적 추론. intel_score 양극화(90+ 또는 NULL, 60~89 = 0건)의 근본 원인.
- Teddy 요구: "더 인사이트 있는 바이어 인텔". Push형 메일 탈피하려면 인텔 자체가 구체 사실 기반이어야 함.
- MCP 우선 검토: 이미 설치된 인프라 재활용이 비용 0. Perplexity는 품질 갭 확인 후 도입.
**대안 기각**:
- Claude API만으로 rubric만 개선 — 데이터 소스가 그대로면 "없는 뉴스를 창작"하는 환각 위험 증가 (추측성 내용 금지 원칙과 충돌).
- Clay API 재호출(enrichment 후속) — 이미 CSV 업로드 시점에 enrich 완료. 추가 호출은 비용 중복.
**관련**: `supabase/functions/run-pipeline/index.ts` agentC / `computeIntelScore`, Sprint03 우선순위 2

---

## ADR-023: 직원 D 프롬프트 v2 — "관찰" 톤 제거 + 단언형 CTA + 맞춤형 풀턴키 포지셔닝 (중간 단계, v3로 발전)
**날짜**: 2026-04-17 (PR10)
**결정**:
- ADR-021의 "문제 제기형 + 객관식 리서치 질문형" 구조에서 발견된 Teddy 실전 피드백 2건을 반영해 v2로 교체.
  - 감시·분석 뉘앙스 표현 전면 금지: "관찰됩니다", "it appears that", "we observe", "based on our analysis" 등 → 중립·존중형으로 ("귀사가 ~하시는 것을 보고").
  - 객관식 4지선다 CTA 폐기 → "단언형 포지셔닝 + 시너지 제안" (질문 아닌 자신감 + 파트너십 기대).
  - SPS 포지셔닝 전환: MOQ 3,000 / 8주 납기 숫자 명시 → "빠른 진행·회신 + 모든 카테고리 제조 파트너 네트워크 + 다국가 수출 경험 + 완전 맞춤형 풀턴키" (숫자는 협상 앵커 → 역효과).
**이유**:
- 바이어 입장에서 "관찰됩니다"는 감시당하는 불편함. B2B 파트너십 톤과 상충.
- 첫 콜드메일의 하드 숫자(MOQ 3,000 등)는 "우리는 5,000 원하는데…" 식 거절 신호 유발.
- CTK(ctkclip.com) 같은 업계 벤치마크의 "with you / create your product" 협업 프레이밍을 참고.
**대안 기각**:
- v1(ADR-021) 그대로 유지 — Teddy 실테스트에서 거절 트리거 발견, 유지 불가.
**한계 → v3로 발전 (ADR-024)**:
- v2 영문 번역 결과가 여전히 validate-draft에서 스팸 flag 판정. "unlock synergy / positioned to play / full-turnkey partner" 같은 세일즈 파트너십 클리셰가 Claude 점수 <8로 낮춤.
- 본문이 "SPS 소개 70% / 바이어 얘기 10%" 비율로 You-to-Me 밸런스 실패.
**관련**: `supabase/functions/run-pipeline/index.ts` agentD, `supabase/functions/generate-draft/index.ts` generate_ko, PR10 커밋.

---

## ADR-024: 직원 D 프롬프트 v3 — "CIA + Challenger Sale" 프레임워크 채택 + agentE flag 사유 로깅
**날짜**: 2026-04-17 (PR11)
**결정**:
- Jason Bay의 **CIA** (Context - Insight - Ask) + Challenger Sale의 **Teach-Tailor-Take control** 톤을 결합해 프롬프트 v3 재작성.
  - **Context**: 바이어 회사의 구체 고유명사(제품·브랜드·도시·파트너·최근 캠페인) **2개 이상 의무 인용**. "당신 회사를 공부했다" 시그널 극대화.
  - **Insight**: 업계 패턴 하나를 가르쳐주듯 제공 후 해당 바이어 상황에 맞춤. Teddy가 업계 동료로서 통찰을 선물하는 느낌.
  - **Ask**: 단일·저부담·타이밍 개방형. "15분만 편하신 때에 확인해보시겠어요?".
  - **P.S. 필수**: "3분짜리 미리보기: https://spscos.com/" 한 줄. 클릭 자체가 **관심 신호** → 향후 CRM 자동 프로토콜 트리거(PR13 예정).
- "좋은 콜드메일 10규칙"을 프롬프트에 내장: You-to-Me 5:1 비율, template 냄새 금지, 단일 Ask, 클리셰 금지어 15개 명시.
- agentE: Claude 스팸 점수 질의를 숫자 단독 → `{score, reason}` JSON으로 업그레이드. flag 시 reason을 `pipeline_logs`에 기록(migration 없이) → 원인 추적 가능.
**이유**:
- v2 실전 테스트에서 "글은 좋아졌지만 스팸 위험 판정". 원인: 반복되는 세일즈 파트너십 어휘(unlock/synergy/positioned to).
- Teddy 요구: "우리가 당신 회사를 공부했고, 당신에게 우리 회사가 좋은 파트너가 될 것 같다"는 인상이 전달되는 메일. 단순 자사 소개 아닌 업계 동료 톤.
- CIA 프레임워크는 B2B 콜드메일 2024~2025 베스트 프랙티스에서 답변율·읽힘율 1위로 검증.
- 클릭 링크는 옵션 B(텍스트 미끼)로 도메인 평판 쌓는 단계에 적합 + 추후 CRM 트리거로 재활용 가능.
**대안 기각**:
- 첨부파일(옵션 C): 도메인 평판 미성숙 + 첫 메일 첨부는 열람률 낮음 + Gmail 필터 위험.
- 텍스트만(옵션 A): Teddy 판단 "1차에서 매력 보여줘야 회신" — 클릭 경로 전혀 없으면 관심 신호 수집 불가.
- AIDA/BAB 등 다른 프레임워크: Context 요소가 약해 "공부한 티"가 안 남.
**한계 / 다음 단계**:
- 바이어 인텔 자체 품질이 여전히 Claude 학습 데이터(~2024) 추론 기반 → CIA의 Context 슬롯 품질 상한. **PR12(Perplexity 도입)**로 해결.
- flag 사유를 UI에 노출하려면 `email_drafts.spam_reason` 컬럼 추가 migration 필요 — 별도 작은 PR.
- 클릭 추적 + CRM 자동 프로토콜은 **PR13** 범위 (랜딩 페이지 + UTM + 클릭 이벤트 → 상태 전이).
**관련**: `supabase/functions/run-pipeline/index.ts` agentD + agentE, `supabase/functions/generate-draft/index.ts` generate_ko, PR11 커밋.

---

## ADR-025: PR11.1 hotfix — 인사말 표준화 + "Warm-Confident" 톤 전환 + Claude 스팸 판정 기준 구체화
**날짜**: 2026-04-17 (PR11.1)
**결정**:
### 프롬프트 (agentD + generate_ko)
- **인사말 필수**: 영문 `Dear ${contact_name},` / 국문 `안녕하세요, ${contact_name} 님.` — 바로 본문 진입 금지.
- **Challenger "Take-control" 톤 → "Warm-Confident" 톤**: 영어 직접 단언 표현이 한국어 번역 후 우월·도발적으로 읽히는 문제 해소.
  - 금지: "대부분의 OEM은 그 속도로 움직이지 못합니다", "SPS는 정확히 그 지점을 위해 만들었습니다", "~ 겪지 않으셨으면 합니다"
  - 권장: "많은 제조사들이 이 부분에서 함께 고민하시는 걸 자주 보았습니다", "SPS가 바로 이런 맥락에서 도움이 될 수 있지 않을까 싶습니다", "조금이라도 힘이 될 수 있다면 기쁜 마음으로 함께하겠습니다"
- **서명**: 영문 `Warm regards,\nTeddy` / 국문 `Teddy 드림`.
- **톤 가드레일**: "partner/partnership/bespoke/turnkey/tailored" 단어 총 2회 초과 금지 (반복 시 세일즈 스크립트 냄새). 경쟁자 직접 비하 금지 ("unlike other manufacturers" 등).

### Claude 스팸 판정 프롬프트 (agentE + validate-draft 동기화)
- **근본 원인**: 이전 프롬프트 "Rate spam risk 1-10"은 너무 포괄적 → Claude가 정상 B2B 콜드메일도 6~7점 과잉 부여 → Teddy 스팸 flag 재발.
- **해결**: 2024~2025 B2B 콜드메일 베스트 프랙티스 기준을 명시적 rubric으로 주입.
  - 10: 자연스럽고 개인화된 peer-to-peer 톤
  - 8-9: 견고한 B2B 콜드메일 (기본값). 파트너십 톤·P.S. 단일 링크·예의 있는 15분 요청은 감점 사유 아님.
  - 6-7: template smell, hype, 반복 jargon, pushy CTA
  - 3-5: 스팸 트리거 단어, hard-sell, 압박
  - 1-2: 명백한 스팸
- **Do NOT deduct for**와 **Only deduct for** 두 섹션을 명시적으로 프롬프트에 포함 → 판정 일관성 확보.

**이유**:
- Teddy 피드백: "글은 좋아졌지만 6/10점 여전히 flag" — Claude 판정이 너무 엄격. Gmail 실제 필터 통과 예상되는 메일도 자체 게이트에서 차단.
- Teddy 피드백: "국문이 도발적" — Challenger Sale의 Take-control 영어 직역이 한국어 정서와 충돌.
- Warm-Confident = 영미권 자신감 유지 + 동북아/중동 정중함 균형.
**대안 기각**:
- 통과 기준 score >= 8 → 6으로 완화: 실제 스팸 위험이 높은 드래프트도 통과 가능 → 도메인 평판 리스크.
- Challenger 톤 완전 폐기: CIA의 Ask 단계에서 자신감 필요. "positioned to" 류만 제거하고 humble-confident 변형 허용.
- 인사말을 `Hi`: GCC·유럽 formal 바이어에게 너무 캐주얼. `Dear`가 3개 리전 통틀어 가장 안전.
**결과**:
- run-pipeline v24 → v25 / generate-draft v9 → v10 / validate-draft v3 → v4 배포.
**관련**: `supabase/functions/run-pipeline/index.ts` agentD + agentE Claude 판정 부분, `supabase/functions/generate-draft/index.ts` generate_ko, `supabase/functions/validate-draft/index.ts`, PR11.1 커밋.

---

## ADR-026: translate_save 경로 한글 혼입 가드 + 재번역 1회
**날짜**: 2026-04-17 (C 버그 2 수정)
**결정**: `generate-draft` Edge Function의 `translate_save` 액션에 한글/한자 감지 정규식(`/[\u3131-\uD79D\u4E00-\u9FFF\uAC00-\uD7AF]/`) 적용. 감지 시 "STRICT RETRY" 지시를 추가해 Claude 1회 재번역. 재번역에도 잔류하면 502 + `code="TRANSLATION_KOREAN_RESIDUAL"` 반환.
**이유**:
- `run-pipeline` agentD는 이미 한글 감지 시 저장 스킵 가드가 있지만(ADR-012), `translate_save`(사용자 수동 경로)에는 가드 없어 UI에 그대로 노출됨 → 사용자가 영문/국문 혼재 초안을 발송 직전까지 모름.
- Claude가 번역 불가 판단 시(특정 신조어·고유명사) 원문 유지하는 경향 → 재번역 1회로 대부분 해소.
**대안 기각**:
- 정규식 자동 제거: 의미 손실. 재번역이 안전.
- 사용자에게 한글 잔류 본문 그대로 노출 + 수동 제거: 사용자가 발송 시점에 발견하게 되어 신뢰 하락.
**관련**: `supabase/functions/generate-draft/index.ts`, 커밋 `0404ac6`, generate-draft v11.

---

## ADR-027: MailQueue 저장 핸들러 validate-draft 호출 전환
**날짜**: 2026-04-17 (C 버그 3 수정)
**결정**: MailQueue.tsx의 초안 수정 "저장" 핸들러를 로컬 `checkSpamClient`만 실행하던 구조에서 `validate-draft` Edge Function 호출로 교체. EmailComposeModal의 `handleSaveDraft`와 동일 패턴 적용(PR6.3).
**이유**:
- 기존: 로컬 규칙(5항목)만 검사하고 결과를 DB `spam_score`/`spam_status`에 저장 → 스팸 단어 제거만으로 10점·"위험 낮음" 가짜 pass 저장. Teddy 지적 "스팸 수정 버튼 → 위험 낮음 반환" 버그.
- 수정: (1) body UPDATE + spam_* 초기화 → (2) validate-draft 호출 → (3) 서버 판정(규칙 + autoFixSpam + Claude rubric ADR-025) 반영.
- 동일 패턴 재사용으로 진입 경로별 검증 일관성 확보.
**대안 기각**:
- 로컬 checkSpamClient를 Claude 로직 복제: 중복 유지비용. 서버가 soft-source of truth여야 함.
- 로컬만 유지 + 경고 배너: 사용자가 무시하고 발송 가능성.
**관련**: `app/components/MailQueue.tsx`, 커밋 `26e8869`.

---

## ADR-028: ZeroBounce bounce / catch-all 처리 정책 명문화 (기존 구현 기록)
**날짜**: 2026-04-17 (Sprint03 우선순위 4 — 기존 로직 문서화)
**배경**: 이 정책은 직원 B(`agentB`)에 암묵적으로 구현되어 있었음. 세션 간 인수인계·감사 시 "왜 catch-all이 Tier1만 pass인가?" 같은 질문이 반복되어 명시적 기록.

### 정책 테이블
| ZeroBounce status | `buyer_contacts.email_status` | `buyers.is_blacklisted` | 다음 파이프라인 단계 |
|---|---|---|---|
| `valid` | `valid` | 변경 없음 | agentC/D 대상 포함 |
| `hard_bounce` | `invalid` | **`true`** (바이어 전체 차단) | 이후 모든 agent 제외 |
| `invalid` | `invalid` | 변경 없음 | agentC/D 제외 (agentD email_status IN valid/catch-all-pass) |
| `catch-all` / `catch_all` (Tier1) | `catch-all-pass` | 변경 없음 | agentC/D 대상 포함 (발송 리스크 감수) |
| `catch-all` / `catch_all` (Tier2/3) | `catch-all-fail` | 변경 없음 | agentC 대상(risky와 동일 취급)·agentD 제외 |
| `unknown` / `spamtrap` / `abuse` / `do_not_mail` / 기타 | `risky` | 변경 없음 | agentC 대상·agentD 제외 |

### 핵심 원칙
1. **Hard bounce만 바이어 전체 차단** (`is_blacklisted=true`). 다른 invalid/risky는 해당 컨택트만 제외하고 바이어의 다른 담당자는 계속 사용.
2. **Catch-all 이원 처리**: Tier1(매출 $50M+ / 직원 500+) 바이어만 catch-all을 `pass`로 인정해 발송 허용. Tier2/3은 발송 리스크가 수익 대비 큼 → `fail`로 처리.
3. **Risky는 "분석은 하되 발송은 제외"**: agentC는 `email_status IN ('valid','catch-all-pass','risky')` 기준으로 인텔 생성하지만 agentD(메일 초안)는 `('valid','catch-all-pass')`만 대상 → 인텔은 쌓되 위험 이메일로는 발송 안 함.

### 크레딧 프리체크 (PR4)
- `https://api.zerobounce.net/v2/getcredits` 사전 조회:
  - HTTP 401/403 → "인증 실패" failed 로그 → agentB 종료
  - HTTP 402 → "결제 필요" failed 로그 → agentB 종료
  - credits <= 0 → "크레딧 0건" failed 로그 → agentB 종료
  - credits <= 200 → agentF에서 경고 생성 (곧 소진)

**이유**:
- 이 정책들이 코드에만 존재 시 세션 간 Claude가 "왜 hard_bounce만 블랙리스트?" 같은 질문을 반복하게 됨.
- 도메인 평판 보호(hard bounce 한 번으로 바이어 전체 차단) + ROI 균형(Tier1 catch-all 감수)이라는 비즈니스 의도를 기록.
**대안 기각**:
- hard bounce + invalid 모두 블랙리스트: invalid는 일시적 오류(DNS·서버 다운)일 수 있어 과도한 차단.
- catch-all 일률 허용: GCC·신흥 시장에 catch-all 많아 전체 차단 시 발송 풀 급감.
**관련**: `supabase/functions/run-pipeline/index.ts` agentB (line ~69-191), `docs/RUNBOOK.md` (별도 운영 가이드로 이관 가능).

---

## ADR 작성 템플릿

```markdown
## ADR-XXX: <결정 요약>
**날짜**: YYYY-MM-DD (PR-N)
**결정**: <무엇을 했는가 한 문단>
**이유**: <왜 이 방향인가, 근거>
**대안 기각**: <검토했지만 기각한 방향 + 기각 이유>
**관련**: <관련 PR, 파일, migration 번호>
```
