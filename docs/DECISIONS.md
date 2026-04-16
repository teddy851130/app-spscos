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

## ADR 작성 템플릿

```markdown
## ADR-XXX: <결정 요약>
**날짜**: YYYY-MM-DD (PR-N)
**결정**: <무엇을 했는가 한 문단>
**이유**: <왜 이 방향인가, 근거>
**대안 기각**: <검토했지만 기각한 방향 + 기각 이유>
**관련**: <관련 PR, 파일, migration 번호>
```
