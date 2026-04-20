---
name: Project - Sprint03 진행 상태
description: Sprint03 완결 보고서 — PR9~PR12 + 버그 4건 + hotfix 2건 / PR13 예정
type: project
originSessionId: 21a63ab3-e127-4fd4-a0d3-c51593fa444c
---
## Sprint03 최종 상태 (2026-04-17 종료)

### ✅ 완료한 PR (커밋 11개)
| PR | 커밋 | 요지 | 관련 ADR |
|---|---|---|---|
| PR9 | `6a1974b` | 직원 D 프롬프트 v1 — 제품 추천형 폐기 → 문제 제기형 + 객관식 CTA | ADR-021/022 |
| PR10+PR11 | `b303b71` | v3 — **CIA + Challenger Sale** 프레임워크. 고유명사 2+ 의무, P.S. 링크, 세일즈 클리셰 15개 금지 | ADR-023/024 |
| PR11.1 hotfix | `e354876` | v4 — 인사말 표준화 + **Warm-Confident 톤** + Claude 판정 rubric 명시화 (8-10 baseline) | ADR-025 |
| 버그 2 | `0404ac6` | translate_save에 한글 혼입 가드 + 재번역 1회 | ADR-026 |
| 버그 3 | `26e8869` | MailQueue 저장 시 validate-draft 호출 전환 (가짜 pass 차단) | ADR-027 |
| ADR 문서 | `6b74681` | ADR-026~028 작성 (bounce 정책 명문화 포함) | ADR-028 |
| jitter | `f3e1e65` | fetchClaudeWithRetry ±500ms jitter (429 완화) | ADR-029 |
| SPAM_WORDS | `f2a1574` | 21개 → 35개 확장 (5곳 동기화) | ADR-030 |
| plan 업데이트 | `43d52c5` | Sprint03_Plan.md 실행 결과 반영 | - |
| PR12 | `7f569c9` | **Perplexity Search 도입** (바이어 인텔 웹 검색) + rubric 완화 | ADR-031 |

### 📦 배포된 Edge Function 최종 버전
- `run-pipeline` v22 → **v28**
- `generate-draft` v6 → **v12**
- `validate-draft` v3 → **v5**
- (`send-email` v7 · `snapshot-kpi` v2 — 변경 없음)

### 🔑 환경변수 (Supabase Edge Function Secrets)
신규 추가:
- `PERPLEXITY_API_KEY` — Teddy $50 크레딧. `digest: 02c92ae...9805a` (검증 완료).
- `PIPEDRIVE_API_TOKEN` — `digest: 44099f3...20bb6` (이름 등록은 확인됨, 실제 값 유효성은 PR13 옵션 C 구현 시 자연 검증 예정).

기존:
- ANTHROPIC_API_KEY · CLAY_API_KEY · ZEROBOUNCE_API_KEY · SERVICE_ROLE_KEY · SMTP_HOST/PORT/USER/PASS · SUPABASE_URL/ANON_KEY/DB_URL

### 📐 핵심 결정 요약 (ADR 참조 정리)
- **직원 D 프롬프트 정책 (ADR-024/025)**: CIA + Challenger, Warm-Confident 톤, 인사말 `Dear [Name],` / `안녕하세요, [이름] 님.` 필수, `Warm regards,\nTeddy` 서명, P.S. 추적 링크 필수, 세일즈 클리셰 15개 + 감시 표현 + 객관식 CTA + 구체 숫자 금지.
- **Claude 스팸 판정 rubric (ADR-025)**: 8~10이 baseline. 파트너십 톤·단일 링크·15분 요청은 감점 X. 구체 스팸 단어·hard-sell·template smell만 감점.
- **SPAM_WORDS 35개 (ADR-030)**: 3곳 동기화(run-pipeline · validate-draft · MailQueue) + 프롬프트 BANNED 리스트 2곳.
- **직원 C 인텔 (ADR-031)**: Perplexity 검색 → Claude 프롬프트 외부 자료 주입 → 환각 방지. 크레딧 부족 시 failed 로그 + Claude-only 폴백 (조용한 패싱 금지).
- **컴퓨트 Intel Score 완화 (ADR-031)**: 2필드 이상 0점이면 전체 0점 (기존 1필드 0점 → 전체 0점에서 완화).
- **ZeroBounce 정책 명문화 (ADR-028)**: hard_bounce만 is_blacklisted / Tier1 catch-all만 pass / risky는 인텔만 수집.
- **429 완화 (ADR-029)**: jitter ±500ms. 근본 해결은 Anthropic Build Tier 2 승격(자연 $40 누적 후).
- **배포 승인 규칙 (feedback_deploy_authorization)**: Production Edge Function 배포는 매번 Teddy 명시 승인("배포해" 등) 필요.
- **외부 API 크레딧 알림 (feedback_api_credit_alert)**: Perplexity·ZeroBounce 등 크레딧 부족 시 조용한 폴백 금지, 반드시 `pipeline_logs` failed + agentF 경고.

### 🎯 남은 검증 대기
- **PR12 Perplexity 실전 품질 검증** — Teddy가 실제 바이어 CSV 업로드 후 인텔 드로어에서 출처 `[1]`/`[2]` 표기·구체 사실 확인. 현재 `recent_news=NULL` 바이어는 `test` 1건뿐이라 신규 CSV 업로드 필요.
- **PIPEDRIVE_API_TOKEN 실제 유효성** — PR13 옵션 C 구현 시 자연 검증됨.

### 🔜 다음 세션에서 착수할 것
- **PR13** — 클릭 추적 + CRM 자동화 (옵션 B 대시보드 위젯 + 옵션 C Pipedrive 자동 Activity 병행). 상세 계획은 `project_sps_future_pr.md` 참조.
- **PR14** — `email_drafts.spam_reason` 컬럼 + UI 노출. PR13 완료 후 재평가.
- Sprint03 미해결 UI 버그 중 "버그 1(회사 미상)"·"버그 4(3개 미수집)"은 **데이터 자연 해소** 확인됨 → 코드 변경 불필요.

## 다음 세션 재개 트리거 문구
**"PR13 시작 — 클릭 추적 + CRM 자동화 (옵션 B+C)"**

새 세션의 Claude가 이 문구로 시작하면 자동으로:
1. CLAUDE.md + MEMORY.md 로드
2. `project_sps_future_pr.md`의 PR13 계획 참조
3. DB 스키마 사전 점검 SQL (`click_events` 테이블 · `buyer_contacts.status` 타입) 실행
4. migration 계획 Teddy 승인 후 Step 1~5 순차 진행
