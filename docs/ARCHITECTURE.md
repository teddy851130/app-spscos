# 시스템 아키텍처

> 새 세션에서 Claude가 이 프로젝트를 빠르게 파악하기 위한 전체 구조 요약.
> 변경 시 ADR로 기록 → [DECISIONS.md](DECISIONS.md)

---

## 전체 흐름

```
CSV 업로드 (외부: Claude + Apollo + Clay)
    ↓
buyers + buyer_contacts (Supabase)
    ↓
run-pipeline Edge Function
  (EdgeRuntime.waitUntil 백그라운드 실행)
    ↓
직원 B (이메일 검증) → C (기업 분석) → D (초안) → E (스팸) → F (모니터링)
    ↓
email_drafts 생성 (영문 초안)
    ↓
사용자 검토 (EmailComposeModal)
    ↓
send-email Edge Function (nodemailer Gmail SMTP)
    ↓
수신자 + Pipedrive BCC + email_logs 기록
```

---

## 주요 테이블

| 테이블 | 역할 | 핵심 컬럼 |
|---|---|---|
| `buyers` | 바이어 기업 정보 | status, tier, recent_news, intel_score, analysis_failed_at, email_count |
| `buyer_contacts` | 기업별 담당자 (N:1) | buyer_id, email_status, is_primary, contact_status |
| `email_drafts` | 직원 D 생성 영문 초안 | buyer_id, buyer_contact_id, spam_status, body_first, body_followup |
| `email_logs` | 실제 발송 기록 | buyer_id, email_type, status, sent_at, gmail_message_id |
| `pipeline_jobs` | 파이프라인 실행 요청 | team, status, current_agent, error_log |
| `pipeline_logs` | 에이전트별 실행 로그 | job_id, agent, status, message |
| `buyer_activities` | 바이어 활동 이력 | buyer_id, activity_type, description |
| `kpi_snapshots` | 일별 KPI 집계 | snapshot_date, region, emails_sent, reply_rate 등 |

---

## Edge Functions (Deno)

| 함수 | 역할 | 비고 |
|---|---|---|
| `run-pipeline` | 직원 B~F 순차 실행 | EdgeRuntime.waitUntil 백그라운드, error_log 저장 |
| `generate-draft` | Claude 국문 초안 / 영문 번역 / DB 저장 | 3가지 액션: `generate_ko`, `translate_only`, `translate_save` (PR6 `force` 파라미터 추가) |
| `validate-draft` | **단일 draft 즉시 스팸 검증** (PR6.3 신설) | agentE 로직(checkSpamRules + autoFixSpam + Claude 점수) 단일 draft 대상 실행. 모달 "저장 및 재검증" 경로에서 호출. TODO(PR7): agentE와 공용 모듈로 통합. |
| `send-email` | nodemailer Gmail SMTP 발송 + email_logs 기록 | RPC `increment_email_sent`로 카운트 원자적 증감 |
| `snapshot-kpi` | 일별 KPI 집계 → kpi_snapshots UPSERT | 정기 실행 예정 |

---

## 프론트엔드 (Next.js 14 App Router)

주요 컴포넌트:
- `Dashboard.tsx` — KPI 카드, 팀 현황, 시스템 경고
- `Pipeline.tsx` — CSV 업로드 + 파이프라인 실행 + 실행 기록
- `Buyers.tsx` — 바이어 DB 테이블 (담당자별 행 펼침, intel_score 배지)
- `MailQueue.tsx` — 오늘 보낼 메일 (팔로업 + 미발송 초안)
- `Emails.tsx` — 이메일 발송 로그
- `KPIReport.tsx` — 팀별 성과 분석
- `Domain.tsx` — SPF/DKIM/DMARC 상태
- `EmailComposeModal.tsx` — 발송 전 최종 검토 + 초안 생성/번역
- `BuyerIntelDrawer.tsx` — 바이어 상세 + 인텔 + 담당자 관리
- `AuthGuard.tsx` — Google OAuth + @spscos.com 도메인 필터

유틸:
- `lib/enumMap.ts` — status/tier/region/spam 중앙 매핑
- `lib/supabase.ts` — Supabase 클라이언트 + invokePipeline 헬퍼
- `lib/types.ts` — 전역 TypeScript 타입

---

## 인증 & 권한

- **로그인**: Google OAuth, `@spscos.com` 도메인만 허용
- **RLS**:
  - 읽기 (SELECT): 공개 (USING(true))
  - 쓰기 (INSERT/UPDATE): authenticated 역할만
  - Edge Function 내부: service_role로 RLS 우회
- **Edge Function 호출**: 프론트에서 anon key 직접 사용 (세션 JWT 아님 — ADR-010)

---

## 직원(에이전트) 역할

| 직원 | 역할 | API / 도구 | 트리거 |
|---|---|---|---|
| A | 바이어 발굴 → CSV 업로드로 대체 | 외부 (Claude + Apollo + Clay) | 수동 |
| B | 이메일 유효성 검증 | ZeroBounce API | 파이프라인 |
| C | 기업 분석 + 인텔 생성 | Anthropic Claude | 파이프라인 |
| D | 영문 초안 작성 | Anthropic Claude | 파이프라인 |
| E | 스팸 검증 (pass/rewrite/flag 판정) | 규칙 기반 + Claude 보조 | 파이프라인 + **validate-draft 단일 호출** (PR6.3~) |
| F | 시스템 모니터링 + 경고 | 내부 쿼리 | 파이프라인 마지막 |

---

## 앞으로 — PR7 에이전트 큐 재설계 예정

현재 모놀리식 `run-pipeline` → 에이전트별 분리 + `agent_tasks` 큐 테이블 기반.

자세한 내용: `~/.claude/projects/.../memory/project_sps_agent_queue.md`

---

## 관련 문서

- [DECISIONS.md](DECISIONS.md) — ADR 목록 (주요 설계 결정)
- [RUNBOOK.md](RUNBOOK.md) — 배포·롤백·트러블슈팅
- [../sprints/](../sprints/) — 스프린트 계획·리포트
- [../CLAUDE.md](../CLAUDE.md) — Claude 작업 지침
