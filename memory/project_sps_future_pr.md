---
name: Project - Sprint03 이후 후속 PR 로드맵
description: Sprint03에서 합의된 후속 작업 — PR12 Perplexity (완료), PR13 클릭추적+CRM (완료), PR14 spam_reason (대기)
type: project
originSessionId: 21a63ab3-e127-4fd4-a0d3-c51593fa444c
---
## PR12 — Perplexity 바이어 인텔 웹 검색 ✅ 완료 (2026-04-17)

ADR-031. 커밋 `7f569c9`. run-pipeline v28 이후 배포됨.
- Perplexity Sonar `/search` 3-result, `credit exhausted` 자동 감지 + failed 로그 + agentF 경고.
- `computeIntelScore` rubric 완화 (2필드 이상 0점 → 전체 0점).

### 검증 대기
- 실전 Perplexity 품질 — 신규 CSV 업로드 후 인텔 드로어에서 `[1]`/`[2]` 출처 표기 + 구체 사실 확인.

---

## PR13 — 클릭 추적 + Pipedrive 자동 Activity ✅ 완료 (2026-04-17)

ADR-032. 커밋 `e4ff31e`. run-pipeline v34 / generate-draft v18 / validate-draft v11.
- 자체 redirect `/go/[token]` + Pipedrive "Website visited" Activity.
- 대시보드 "오늘의 관심 리드" 위젯 (72시간).

### 검증 대기 — 상세는 `project_sps_pr13.md` 참조
- 실제 토큰 클릭 → click_events 기록 + Pipedrive Activity 생성 확인.
- 신규 초안 P.S.에 `app-spscos.vercel.app/go/{token}` 삽입 확인.

---

## PR15 — 메일 발송 첨부 파일 업로드 ✅ 완료 (2026-04-19)

ADR-035. 커밋 `72cd756`. send-email v13.
- EmailComposeModal 첨부 UI 실제 구현 (드래그 & 드롭 + 클릭, 다중 파일, 목록·삭제·크기 표시).
- base64 inline 방식, 총 4MB 제한.
- 파일 타입 제한 없음 (Gmail 필터 의존).

### 검증 대기
- 실전 발송 smoke test (소용량 PDF 1~2개 첨부해 Teddy 본인 메일로 발송 → 수신 확인).

---

## 통합 웹사이트 런칭 시 tracking URL 전환 (대기 · Teddy 트리거)

### 배경 (2026-04-19 결정)
- 현재 tracking URL `https://app.spscos.com/go/{token}`은 **내부 팀 전용 플랫폼 서브도메인** → 바이어에게 노출하는 건 부적절 (내부 도구 존재 유출).
- `spscos.com`은 현재 별도 하드코딩 웹사이트. Teddy가 **`spscos.com` 자체를 통합 웹사이트로 재구축 계획 중**.
- 통합 웹사이트 런칭 시 해당 도메인 구조 내에서 `/go/{token}` 경로를 수용해 URL을 교체하기로 결정.
- **임시 운영**: 기능은 살아있지만 바이어에게 `app.spscos.com/go/...` URL이 노출되지 않도록 신규 대규모 발송은 런칭 이후로 미루는 것이 안전.

### 런칭 시 전환 단계 (Teddy가 새 URL 알려준 시점에 실행)
1. 가비아 DNS / 통합 사이트 라우팅에서 `/go/:token` 경로 확보
2. Supabase Edge Function Secret `TRACK_BASE_URL=<new-base>/go` 업데이트 (Dashboard → Functions → Secrets)
3. 3개 Edge Function 하드코딩 fallback(`run-pipeline:613`, `generate-draft:94`)을 새 도메인으로 정정 후 재배포
4. `validate-draft:40-42` + `MailQueue.tsx:76` SPS_DOMAIN_RE에 새 도메인 OR 추가 (기존 `app-spscos.vercel.app/go`는 legacy로 계속 유지)
5. `app.spscos.com/go/{token}` → Vercel 라우트는 계속 살려둬 **이전 발송분 클릭도 수집** (단, 외부 노출 없음)

### 주의
- URL 전환 후에도 token 자체는 변경 불가 (buyer_contacts.tracking_token UNIQUE). 토큰은 그대로, base URL만 교체.
- 전환 시점 이전에 이미 발송된 메일들은 `app.spscos.com/go/...`로 남아있음 (바이어가 이미 받은 걸 소급 변경 불가) → 발송 규모를 통제해야 함.

---

## PR14 — email_drafts.spam_reason 컬럼 + UI 노출 ✅ 완료 (2026-04-19)

ADR-033. 커밋 `c6ff14d`. run-pipeline v36 · validate-draft v13.
- migration 012 apply (email_drafts.spam_reason TEXT, backfill 없음).
- agentE 두 flag 경로 + validate-draft updatePayload 모두 spam_reason persist.
- Dashboard "검토 필요" 섹션 + MailQueue 카드에 인라인 사유 박스 노출.
- EmailComposeModal은 기존 alert(`vdata.reason`) 커버로 변경 없음.

### 검증 대기 (smoke test, Teddy 수동)
- 신규 파이프라인 실행 시 flag 초안 발생 → 대시보드/MailQueue에 사유 줄 노출 확인.
- "저장 및 재검증" 시 validate-draft가 spam_reason 갱신하는지 확인.
- pass 로 바뀐 초안은 spam_reason NULL로 clear 되는지 확인.

### 알려진 한계
- 기존 flag 초안(PR14 이전 생성)은 spam_reason=NULL → UI에서 줄 자체가 숨겨짐. 재검증 시점에 채워짐.
