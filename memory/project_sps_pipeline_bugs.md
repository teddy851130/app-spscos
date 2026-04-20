---
name: Project - 파이프라인 버그 + PR16 이월
description: 2026-04-20 첫 자동 발굴 후 파이프라인 실행에서 발견된 3개 버그. Teddy가 DB 활용 테스트 후 전체 수정 내용 공유 예정 — 다음 세션 시작 시 그 결과 반영하여 PR16 진행
type: project
originSessionId: aa970480-04ca-4a6a-a73a-b686db6dc218
---
## 발견 시점
2026-04-20 — 자동 발굴된 15개사/26명 CSV 업로드 → 파이프라인 1회 실행 후

## 버그 1: Perplexity API 401 (해결됨)
- **증상**: 모든 회사 인텔 분석에서 Perplexity HTTP 401 (Invalid API key) → Claude-only 폴백 → 점수 부실 → 19곳 `intel_failed` 마킹
- **원인**: Supabase Functions env의 `PERPLEXITY_API_KEY` 값이 무효 (4/17 등록 후 어떤 사유로 invalid 상태). 크레딧 부족(402)이 아닌 인증 실패(401)
- **해결**: Teddy가 콘솔에서 키 재확인 → Supabase env 갱신 → 재실행 결과 24곳 모두 합격 (Perplexity 성공 24/실패 0)
- **교훈**: "충전" 안내는 401에는 부적절. 코드의 에러 메시지("https://www.perplexity.ai/settings/api 에서 충전 후 재실행")가 misleading — **PR16-D 후보**: 401과 402를 분리해서 다른 안내 메시지 출력

## 버그 2: intel_score≥60인데 status='intel_failed' 모순 (PR16-A 대상)
- **증상**: REFY (100점), WHITES (100점), Tarte (100점), Nahdi (90점) — 모두 합격선인데 status='intel_failed' + recent_news 채워짐 + analysis_failed_at NOT NULL
- **원인 추정**: `run-pipeline/index.ts`가 3팀(GCC/USA/Europe) 동시 실행됨. 각 job이 동일 buyer를 동시 처리 → race condition. 한 job이 1차 score<60으로 status='intel_failed' 마킹, 다른 job이 후행 처리에서 score=100으로 update (status는 안 건드림) → 모순 상태로 잔존
- **입증**: pipeline_logs에서 08:00:36/38/48 거의 동시에 직원C 완료 메시지 3건. team별 job_id 다름
- **Fix 후보 (PR16-A)**: 합격 분기([line 495-499](supabase/functions/run-pipeline/index.ts#L495-L499))에 `status: 'Cold'` 추가. SELECT 단계에서 `recent_news IS NULL`로 발송 진행 중인 buyer는 이미 제외되므로 'Cold' reset 안전

## 버그 3: 직원D/E가 team 필터 없이 동일 email_drafts 풀 처리 (PR16-B 대상)
- **증상**: 3 jobs가 동일 drafts를 중복 처리. USA E 39건 완료, Europe E 35건 완료 (같은 drafts 두 번 처리), GCC E 6건 처리 후 stuck
- **원인**: [agentE](supabase/functions/run-pipeline/index.ts#L867) 함수 시그니처가 `(_team: string)` — 파라미터 미사용. SELECT에 team 필터 없음. 직원D도 동일
- **GCC stuck**: USA/Europe이 먼저 drafts 처리 → GCC는 잔여 drafts가 적은 상태에서 background task timeout으로 silently 종료. error_log=null. 2026-04-20 08:10에 수동 강제 완료 마킹
- **Cost impact**: Claude API 호출 ~3배 낭비 (직원D + 직원E 모두)
- **Fix 후보 (PR16-B)**: 직원D/E SELECT에 buyer.region = team 조건 추가. 또는 PR16-C: advisory lock으로 동시 실행 차단

## 버그 4: Emails 페이지 잘못된 "발송 완료" 오표시 (PR16-E 대상)
- **증상**: 발송 0건인데 모든 바이어가 "발송 완료" + 수신자 빈칸
- **원인**: `email_logs` 비어있을 때 [Emails.tsx:50-75](app/components/Emails.tsx#L50-L75) 폴백이 `buyers.status != 'Cold'` 모두 가져옴 → `intel_failed` 바이어도 'sent'로 매핑. `contact_email`은 레거시 컬럼이라 NULL → 수신자 빈칸
- **Fix 후보 (PR16-E)**: 폴백 필터를 발송 진행 status만 포함 (`['Contacted','Replied','Sample','Deal','Lost','Bounced']`). 또는 폴백 자체 제거 (email_logs 비어있으면 빈 화면)

## 다음 세션 시작 시 (Teddy 테스트 후)
1. Teddy가 현재 DB로 테스트 진행 중 → 전체 수정 내용 공유 예정
2. 그 수정 내용 받으면 PR16-A/B/C/D/E 우선순위 재정리 + 일괄 PR 또는 분리 PR 결정
3. Edge Function 재배포는 prod 영향 → 명시 승인 후 진행

## 강제 정리한 GCC stuck job
- ID: `fc4b0a64-2444-45dc-8eaa-f0f40e2c314b`
- 2026-04-20 08:10:42 manual update: status='running' → 'completed', error_log에 사유 기록
