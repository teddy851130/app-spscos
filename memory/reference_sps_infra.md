---
name: Reference - SPS 인프라 좌표
description: Supabase/Vercel/GitHub 프로젝트 식별자 + Edge Function 현재 버전 — MCP 호출·배포·롤백 시 참조
type: reference
originSessionId: 21a63ab3-e127-4fd4-a0d3-c51593fa444c
---
## Vercel 프로젝트
- **Production URL**: `https://app.spscos.com` (커스텀 도메인, 가비아 DNS)
- **기본 Vercel 도메인**: `app-spscos.vercel.app` — 현재 응답 불가 (404). 커스텀 도메인 전환 이후 자동 비활성 상태로 보임. 실사용은 커스텀 도메인만.
- **GitHub main push 시 자동 배포** (~2~3분)

## Supabase
- **Project Ref**: `hoerrdwupqhmqyyvwefg`
- **Project URL**: `https://hoerrdwupqhmqyyvwefg.supabase.co`
- **MCP 서버**: `.mcp.json`에 정의. `SUPABASE_ACCESS_TOKEN` (Teddy User env)에서 PAT 주입.
- **Edge Functions (2026-04-21 PR18 배포 기준 최신)**:
  - `run-pipeline` — 직원 **B/C/F만** 실행 (D/E 제거, PR18/ADR-046). 787줄. ADR-024/025/029/030/031/032/033/036/037/039 반영.
  - `generate-draft` — 국문 초안 + 영문 번역 경로. PR17/PR17.1 반영: HARD LIMITS 7건 + 5줄 서명 블록(Managing Director) + 180단어 상한 + Hi firstName. ADR-024/025/026/030/032/043/044.
  - `validate-draft` — 즉시 스팸 검증. PR17 반영: SPAM_WORDS 50 + Korea 누락 flag + 180단어 초과 flag. ADR-025 + ADR-030 + ADR-032 + ADR-033(spam_reason persist) + ADR-043/044.
  - `send-email` **v13** — Gmail SMTP 발송. PR15(ADR-035)에서 첨부 파일 처리 추가 (base64, 총 4MB 제한).
  - `snapshot-kpi` v7 — KPI 스냅샷.

## 배포 도구
- Supabase MCP `deploy_edge_function`: 소형 함수에 적합. 큰 파일(1000줄+)은 payload 한계.
- **`npx supabase@latest functions deploy <name> --project-ref hoerrdwupqhmqyyvwefg`** — 큰 파일 배포용. `SUPABASE_ACCESS_TOKEN` env 필요.

## GitHub
- 레포: `app-spscos` (main branch 기준 PR 머지 → Vercel 자동 배포)
- Git user: `teddy851130`
- 최근 Sprint03 커밋: `6a1974b`(PR9), `b303b71`(PR10+PR11), `e354876`(PR11.1)

## 로컬 경로
- 프로젝트 루트: `c:\Users\신동환\Desktop\Claude\app-spscos`
- 글로벌 CLAUDE.md: `C:\Users\신동환\.claude\CLAUDE.md`
- 메모리: `C:\Users\신동환\.claude\projects\c--Users-----Desktop-Claude-app-spscos\memory\`

## Claude API
- 모델 ID (현재 사용): `claude-haiku-4-5-20251001` (직원 C + generate-draft 전 경로 + validate-draft 스팸 판정). PR18(ADR-046) 이후 직원D/E 배치 경로 제거 → 모델 호출 지점 단순화.
- API 키: Edge Function 환경변수 `ANTHROPIC_API_KEY`에 주입 (Supabase Dashboard → Functions → Environment)

## 콜드메일 서명 좌표 (PR17.1/ADR-044 확정 2026-04-21)
프롬프트·발송·첨부 어디서든 동일 값 사용. 변경 시 generate-draft translate_save `SIGN-OFF RULE` + run-pipeline agentD(제거됨) 동시 갱신 필요 있었음. 현재 agentD 제거 후에는 generate-draft 단독.

```
Warm regards,

Teddy Shin
Managing Director, SPS International
Email: teddy@spscos.com  |  Web: spscos.com  |  Mobile: +82 10 4409 0963
8 Myeongdal-ro 22-gil, Seocho-gu, Seoul 06668, Republic of Korea
```

- **회사명**: SPS International (영문 통일). 코드 곳곳에 `SPS Cosmetics` 표기도 있으나 대외 서명은 `SPS International`.
- **직책**: Managing Director (CEO/Founder 대신 채택, ADR-044 근거 참조)
- **이메일**: teddy@spscos.com
- **웹사이트**: spscos.com
- **Mobile**: +82 10 4409 0963
- **등록 주소 영문**: 8 Myeongdal-ro 22-gil, Seocho-gu, Seoul 06668, Republic of Korea
- **이모지 미사용** (ADR-044)

## 외부 API
- **Perplexity Search API** (PR12 도입, ADR-031): 바이어 인텔 웹 검색. Teddy $50 선충전. env `PERPLEXITY_API_KEY` ✅ 등록 완료 (digest 02c92ae).
- **Pipedrive API** (PR13 사용, ADR-032): CRM Activity 자동 등록 (`/persons/search` + `/activities` POST). env `PIPEDRIVE_API_TOKEN` ✅ 등록 완료 (digest 44099f3). 실제 토큰 유효성은 첫 클릭 시 자연 검증.
- **ZeroBounce**: 이메일 검증. 이미 사용 중 (직원 B). env `ZEROBOUNCE_API_KEY`.
- **Anthropic Claude API**: Build Tier 1 (기본). 2026-04-19 선불 크레딧 충전 완료 ($40+) → **2026-04-26경 Tier 2 자동 승격 예상** (7일 경과 요건). 승격 후 RPM/TPM 대폭 상향 → agentE 배치 5 병렬 호출 시 간헐 발생하던 429 해소 예상. 실측은 다음 실전 파이프라인 실행 시 확인. 현재 실측 비용 월 $1~3 수준 (Sprint03 이전 30일 $0.79).

## 도메인 / 이메일 인증 (2026-04-19 정비)
- **도메인 관리**: 가비아 (My가비아 → 서비스 관리 → 도메인 → spscos.com → DNS 관리툴)
- **MX**: `smtp.google.com` (Google Workspace)
- **SPF**: `v=spf1 include:_spf.google.com ~all` ✅
- **DKIM**: `google._domainkey` ✅ (Google Workspace 서명)
- **DMARC**: `v=DMARC1; p=none; rua=mailto:40694b308d@rua.easydmarc.asia; ruf=mailto:40694b308d@ruf.easydmarc.asia; fo=1;` (2026-04-19 정비 완료)
- **DMARC 모니터링**: **EasyDMARC** (https://app.easydmarc.com) — teddy@spscos.com Google 로그인. 현재 MSP trial (2026-05-02경 만료 → Free 다운그레이드 필요)
- **가비아 DNS 제약**: CNAME 값에 언더스코어(`_`) 포함 거부. Managed DMARC/DKIM 서비스의 CNAME 위임 방식 사용 불가 → TXT 직접 등록 방식 필수
- **정체 미확인 CNAME**: `pdn1tzeb1620._domainkey`, `pdn2tzeb1620._domainkey`, `pds.pdrserv` 3개가 `pdrserv.com`(PowerDMARC 추정)로 위임. 삭제 전 반드시 정체 확인 (프로젝트 메모리 참조)

## Vercel 환경 변수 (PR13 추가)
- `SUPABASE_SERVICE_ROLE_KEY` ✅ 등록 완료 (Production/Preview/Development) — `/go/[token]/route.ts` 가 RLS bypass로 click_events INSERT + contact_status UPDATE 용도.
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — 기존 (client 쿼리).
- ⚠️ **`PIPEDRIVE_API_TOKEN`** — 2026-04-19 첫 클릭 테스트 결과 **Vercel에 미등록** 확인 (`pipedrive_status='skipped'` + `pipedrive_error='PIPEDRIVE_API_TOKEN 미설정'`). 이전 메모리 "등록 완료"는 Supabase Edge Function env에 혼동 기록. route handler는 Vercel 런타임이므로 **Vercel env에 등록 필요**. Teddy 수동 등록 대기 중.

## 새 DB 객체 (PR13, migration 011)
- `buyer_contacts.tracking_token` (text NOT NULL UNIQUE, 12자 hex, DB 기본값) — P.S. 링크 토큰.
- `click_events` 테이블 — id/buyer_contact_id/clicked_at/ip_*/pipedrive_*. RLS SELECT=true, INSERT/UPDATE는 service_role bypass.
