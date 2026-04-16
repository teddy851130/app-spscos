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

## ADR 작성 템플릿

```markdown
## ADR-XXX: <결정 요약>
**날짜**: YYYY-MM-DD (PR-N)
**결정**: <무엇을 했는가 한 문단>
**이유**: <왜 이 방향인가, 근거>
**대안 기각**: <검토했지만 기각한 방향 + 기각 이유>
**관련**: <관련 PR, 파일, migration 번호>
```
