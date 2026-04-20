---
name: Project - Sprint04 진행 상태
description: SPS 바이어 앱 회신율 확보 스프린트. Generator/Evaluator 루프 3회차로 96점 플랜 확정 · 2026-04-20 PR0+PR16 완료 배포 대기. 새 세션은 여기부터 읽고 `sprints/Sprint04_NextSession.md` 트리거로 이어가기
type: project
originSessionId: e27efffa-00cd-4289-b37d-1adcebf88a93
---
## 현재 단계 (2026-04-20 밤 기준)

**Sprint04 Day 1 종료.** Generator/Evaluator 3라운드로 플랜 96점 확정 + PR16 코드·SQL·docs 완성 · **배포는 Teddy 승인 대기**. 내일(4/21 화) 첫 액션: Teddy가 Supabase Dashboard에서 PR16 배포 승인 → PR17 착수.

## 완료된 항목 (2026-04-20)

### 플랜 루프 (Generator + Evaluator 3회차)
- v1 `sprints/Sprint04_Plan_v1.md` — 84점 (Evaluator review v1)
- v2 `sprints/Sprint04_Plan_v2.md` — 93점. PR0 신설·KPI 이중화·PR20/21-Code Sprint05 이월·일정 재조정
- v3 `sprints/Sprint04_Plan_v3.md` — **96점 확정**. 실측 스팸 메일 7개 트리거 주입(PR17/PR18), 국문 AI 냄새 루브릭 3건, PR0 DMARC 분기, PR18 fetch 샘플 코드, 일정 "50통+1주일" 5/10 판정
- 리뷰 3개: `Sprint04_Review_v{1,2,3}.md`

### PR16 코드 fix (배포 대기)
- **Perplexity 401 분리 안내** (`run-pipeline/index.ts` fetchPerplexitySearch, ADR-036)
- **agentC 합격 블록 status='Cold' reset** (L495-L510, ADR-037) — race condition 복구
- **agentD team 필터** (L538 시그니처·L567-L575 SELECT에 `region = team` 추가, ADR-038)
- **agentE team 필터** (L867-L895 buyer_id → region 2단계 맵핑, ADR-038)
- **Emails.tsx 폴백 엄격화** (L50-L80 허용 status 목록 명시, ADR-039)
- `npx tsc --noEmit` 통과

### SQL 준비 (배포 대기)
- `supabase/migrations/PR16_cleanup.sql` — 5단계: ①사전점검 ②백업(`buyers_intel_recovery_20260420`) ③UPDATE ④검증 ⑤롤백. Teddy가 하나씩 실행 후 건수 검증.

### PR0 준비 (Teddy 수동)
- `docs/PR0_Delivery_Check.md` — A 자기 앞 발송 / B DMARC / C 판정 / D STOP 대안
- 4/20 1차 측정: **4/5 Primary (80%)** — 경계. PR18 배포 후 재측정 필수.
- DMARC 리포트 EasyDMARC: SPF/DKIM/DMARC 모두 Pass. 블랙리스트 Google 공유 IP 1건(0.76%, 영향 미미).

### 실측 스팸 메일 분석 (Trinny London 건)
7개 트리거 확보 → PR17/PR18 프롬프트 규칙으로 변환 예정:
1. 본문 230+ 단어 (상한 150)
2. AI 오프닝 "I was pleased to see" 금지어
3. 설교 인사이트 문단 "We consistently notice that" 금지
4. 회사 소개 독립 문단 금지 (1줄 내 삽입만)
5. SPAM_WORDS 35→50 확장 (leveraging/multi-market/rapid response capability 등 15개)
6. Korea/K-Beauty 누락 → validate-draft에서 flag 강제
7. P.S. 단독 URL → 본문 중간 자연 삽입 (PR17 이미 반영)
추가: `Dear` → `Hi ${firstName},` 전환

## Teddy 합의 사항

- **폐기 판정 기준 A안**: 50통 누적 + 1주일 관찰 → **2026-05-10(일) 최종 판정**. 5/7(목) 중간 체크.
- 회신 질 루브릭 ③ 이상 1건이면 플랫폼 유지. 0건이면 경량 워크플로(Claude 직접 초안 + Teddy 수동 발송) 전환.
- Primary "무조건 100%" 요구 → 80% 허용 안 됨, PR18 이후 재측정 필수.

## 내일(4/21 화) 첫 액션 — 새 세션 트리거

**`sprints/Sprint04_NextSession.md` 참조.** 구체 절차:
1. Teddy가 `supabase/migrations/PR16_cleanup.sql` ① 사전 점검 블록 실행 → 건수 확인
2. 건수 3~10 사이면 ②③④ 실행. Edge Function `run-pipeline` 재배포 승인
3. Teddy의 "go" 후 Claude가 Vercel 자동 배포 대기 + Edge Function deploy
4. PR17(담당자 분리 + Teddy Shin 서명 + spscos.com 본문 삽입) 착수

## 이월 / 대기

- **PR0 재측정**: PR18 배포 직후 Teddy 자기 앞 2~3통 테스트 (토 1차 발송 전 필수)
- **PR17~22**: v3 플랜대로 화~금 진행
- **PR20 파이프라인 재설계 + PR21 코드 분리**: Sprint05 이월 (위험 관리)
- **실전 발송**: 4/25(토) 5~10통 시작 → 5/3경 50통 누적 → 5/10 판정
