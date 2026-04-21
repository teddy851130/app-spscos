---
name: Project - Sprint04 진행 상태
description: SPS 바이어 앱 회신율 확보 스프린트. PR16~PR18 배포 완료 · 직원D/E 자동 경로 폐기 · 수동 초안 경로 단일화 · PR19(팔로업 버튼 UI) 착수 대기 · 5/10 최종 판정
type: project
originSessionId: e27efffa-00cd-4289-b37d-1adcebf88a93
---
## 현재 단계 (2026-04-21 밤 기준)

**Sprint04 Day 2 종료.** 오늘 하루 PR16 + PR17 + PR17.1 + PR17.2 + PR18 총 4커밋 배포. 아키텍처 큰 방향 전환: **배치 자동 초안 경로 폐기 → Buyers DB 수동 경로 단일화**. "오늘 보낼 메일" 페이지 제거. 내일(4/22 수) 첫 액션은 **PR19 팔로업 버튼 UI 재설계** (발송 카운트 기반 컬러 계단).

## 2026-04-21 오늘 배포한 커밋 (시간순)

| PR | 커밋 | 내용 |
|---|---|---|
| PR16 배포 | `d93076b` (어제 커밋) push | Perplexity 401 분리 · agentC status reset · agentD/E team 필터 · Emails 폴백 엄격화. SQL 사전점검 결과 0건(이미 해소) → DB 정리 skip. |
| PR17 (ADR-043) | `f5616b9` | 담당자 분리(MailQueue → buyer_contacts JOIN per-contact flatten) + HARD LIMITS 7건(150단어·금지 오프닝 6개·설교 금지·회사소개 1줄·Korea 필수·URL 본문 중간·Hi firstName) + SPAM_WORDS 35→50 + `Donghwan Shin`→`Teddy Shin` + validate-draft Korea/단어수 flag |
| PR17.1 (ADR-044) | `2864609` | 서명 5줄 블록(Managing Director + Email/Web/Mobile + 등록 주소) + MAX_WORDS 150→180 |
| PR17.2 (ADR-045) | `5d99f93` | "오늘 보낼 메일" 페이지 완전 제거. Sidebar 메뉴 + page.tsx 라우트 + MailQueue.tsx 파일(-775줄) 삭제. Dashboard 팔로업 섹션에 EmailComposeModal 직접 통합 + buyer_contacts JOIN flatten 이식 |
| PR18 (ADR-046) | `fe6604e` | run-pipeline `agentD`(배치 영문 초안) + `agentE`(배치 스팸 검증) 전체 삭제. SPAM_WORDS/헬퍼 동반 제거. Dashboard "이메일 초안 목록" / "검토 필요" / "인텔 대기" 3개 섹션 제거. run-pipeline 1335→787줄. |

## 합의된 주요 결정

- **초안 생성 경로 단일화**: Buyers DB 페이지 → 바이어 인텔 탭 → 국문 초안(generate_ko) → 영문 번역(translate_save) 수동 경로만. 배치 자동 경로 완전 폐기.
- **콜드메일 서명 5줄 블록 확정**: `Warm regards, / Teddy Shin / Managing Director, SPS International / Email+Web+Mobile / 등록 주소`. 이모지 미사용.
- **팔로업 관리 진입점**: Dashboard "팔로업 필요" 섹션 단일 (MailQueue 페이지 삭제).
- **필터는 드롭다운 X, 버튼 컬러 계단 O**: PR19에서 Buyers 행별 발송 버튼 구현 — email_count 0=회색/흰(첫 발송), 1=노랑(1차), 2=녹색(2차), 3=빨강(3차), ≥4=빨강/보관.

## 이월 / 대기

- **PR0 재측정**: 프롬프트/서명 전면 변경 후 신규 초안으로 재측정 필요. Teddy가 자기 앞 2~3통 시험 → Primary 5/5 확인 후 외부 발송. 토 1차 발송 직전 필수.
- **PR19 (목 4/23 예정, 내일 수 4/22 착수 가능)**: 팔로업 버튼 UI + 컬러 계단 + 최종 "보관" 워딩 확정.
- **실전 발송**: 4/25(토) 5~10통 시작 → 5/3경 50통 누적 → 5/10 최종 판정.
- **검증**: 프롬프트 효과 4가지(Hi firstName/180단어/Korea/URL mid-body) + 5줄 서명 — 다음 파이프라인 신규 바이어 생성 사이클에서 자연 검증 예정. 내일 Teddy가 신규 바이어 CSV 업로드 시 확인.

## 원래 v3 PR18에서 폐기된 것

- "스팸 자동 재생성 MAX_REGEN=2 루프" — 배치 자동 초안 경로가 있을 때만 유효. 수동 경로에서는 사용자가 저장 시 validate-draft 1회 호출 → flag이면 본인이 다듬어 재저장. 재생성 자동 루프 불필요.
- generate-draft BODY FORMAT(문단 빈 줄 2칸) + `normalizeParagraphs` 후처리 — 필요성 판단은 실측 후로 보류.

## 다음 세션 진입점

1. 이 파일 먼저 Read (자동 로드됨)
2. `sprints/Sprint04_Plan_v3.md` PR19 섹션 확인 (팔로업 버튼 UI 컬러 계단 테이블)
3. Teddy 첫 멘트 예상: **"PR19 착수"** 또는 **"팔로업 버튼 작업"**
4. PR19 착수 전 "보관" 최종 워딩 확정(Teddy 확인 필요 — 후보: 보관 / 최종 시도 / 리마인드)
