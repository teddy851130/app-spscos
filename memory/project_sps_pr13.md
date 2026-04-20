---
name: Project - PR13 클릭 추적 + CRM 자동화 (종료)
description: PR13 완료 — 클릭 추적 + contact_status + Pipedrive Activity + 대시보드 위젯 전 기능 검증 완료
type: project
originSessionId: b1aeb5f0-e8f4-4fc7-8f05-470c8050f01a
---
## 2026-04-19 최종 검증 완료 (테스트·hotfix·정리 모두 종료)

### ✅ 전 기능 동작 확인
| 항목 | 결과 |
|------|------|
| `app.spscos.com/go/{token}` → `spscos.com/` 302 redirect | ✅ |
| `click_events` INSERT (UA/IP/country 수집) | ✅ |
| `contact_status` 'Interested' 갱신 (보호 상태 Sample/Deal/Lost/Bounced 제외) | ✅ |
| Pipedrive API 토큰 작동 확인 (토큰 누락 → Person 없음으로 에러 진전) | ✅ |
| 대시보드 "오늘의 관심 리드" 위젯 노출 (Teddy 확인) | ✅ |

### 2026-04-19 진행 사항
- **hotfix 커밋 `c5a65c7`** ("PR13 hotfix: tracking URL fallback을 app.spscos.com/go로 정정")
- Edge Function: `run-pipeline` v35 · `generate-draft` v19 · `validate-draft` v12
- Vercel env `PIPEDRIVE_API_TOKEN` 등록 (Teddy 수동, Production+Preview+Development)
- 테스트 데이터 정리: click_events 2건 삭제 + Sisley Paris contact_status null 복구

### 학습 포인트 (잊지 말기)
1. **Vercel 기본 도메인(`*.vercel.app`)은 커스텀 도메인 전환 후 응답 불가 상태가 될 수 있음** → fallback URL 하드코딩 시 반드시 실제 production 도메인 기준으로.
2. **`app.spscos.com` 도메인은 내부 팀 전용** → 바이어에게 직접 노출되는 URL로는 부적절. 통합 웹사이트 런칭 전까지 실전 발송 보류 권장 (상세: `project_sps_future_pr.md`).
3. **Vercel env vs Supabase Edge Function env 혼동 주의** — route.ts는 Vercel 런타임, Edge Function은 Supabase 런타임. 환경변수 등록 위치가 다름.
4. **Pipedrive Person은 BCC 발송이 선행돼야 생성됨** → 발송 이력 없는 바이어 클릭은 자연스럽게 `skipped`.

---

## 배포 완료 (2026-04-17)

**커밋**: `e4ff31e` — "PR13: 클릭 추적 + CRM 자동화 (옵션 B+C)"
**ADR**: [ADR-032](../../docs/DECISIONS.md#adr-032)

### 주요 파일 (참조용)
- `supabase/migrations/011_click_tracking.sql` (+ rollback)
- `app/go/[token]/route.ts` (Next.js route, Vercel 런타임)
- `app/lib/supabaseAdmin.ts` (service_role 클라이언트)
- `app/lib/pipedrive.ts` (Person 검색 + Activity POST)
- `app/components/InterestedLeadsWidget.tsx` (72h 위젯)

### 환경 변수 (Vercel)
- `SUPABASE_SERVICE_ROLE_KEY` ✅
- `PIPEDRIVE_API_TOKEN` ✅ (2026-04-19 등록)
