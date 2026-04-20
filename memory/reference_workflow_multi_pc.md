---
name: Reference - 다중 PC 작업 워크플로
description: Teddy가 여러 PC에서 이 프로젝트를 git pull/push로 이어받는 구조. 메모리 자동 로드 작동 원리 + Claude 새 세션 시작 시 점검 사항
type: reference
---

## 구조 (2026-04-20 setup 완료)

이 프로젝트는 메모리(세션 간 동적 컨텍스트)를 **`memory/` 폴더에 git 추적**한다. Claude의 메모리 자동 로드 시스템 경로(`.claude/projects/<slug>/memory`)는 **junction**으로 프로젝트 `memory/`를 가리켜서, 양쪽 경로가 항상 동일한 파일을 본다.

```
프로젝트:  C:\Users\신동환\Desktop\Claude\app-spscos\memory\        (git source of truth)
          ↑ junction
시스템:    C:\Users\신동환\.claude\projects\<slug>\memory\          (Claude 자동 로드 위치)
```

## Claude 새 세션 시작 시 체크리스트

1. **MEMORY.md가 자동 로드됐는지 확인** — 시스템 프롬프트에 인덱스가 있어야 함
2. 사용자가 "이전 PC에서 작업한 거 이어해줘" 같은 멘트하면:
   - `git log --oneline -5`로 최근 커밋 확인 (특히 docs/메모리 커밋이 pull됐는지)
   - `memory/MEMORY.md` + `memory/project_sps_buyer_app.md` 먼저 읽기
   - 진행 중 PR/이월 항목은 `memory/project_sps_pipeline_bugs.md`, `memory/project_sps_future_pr.md`
3. Junction이 깨졌는지 의심되면(메모리 자동 로드 안 됨):
   ```bash
   diff -q ~/.claude/projects/<slug>/memory/ ./memory/
   ```
   다르거나 한쪽이 비어있으면 junction 재생성 필요. `docs/SETUP_NEW_PC.md` 참조

## Teddy의 일상 git 흐름

| 시점 | 명령 | 잊으면 생기는 일 |
|---|---|---|
| 작업 시작 | `git pull` | 다른 PC 메모리 안 받아짐 → 컨텍스트 손실 |
| 메모리 갱신 후 | `git add memory/ && git commit -m "..." && git push` | 다음 PC에서 이번 세션 진행 사항 못 봄 |
| 새 PC 첫 사용 | `docs/SETUP_NEW_PC.md` 절차 1회 | Claude 자동 로드 작동 안 함 |

## 동시 작업 주의

같은 시각에 PC A와 PC B에서 모두 메모리 갱신 → git conflict 발생. 한쪽 작업 끝나고 push → 다른 쪽 pull → 다시 작업 패턴 권장. Claude가 메모리 충돌 만나면 사용자에게 어느 버전 우선할지 묻고 결정.

## 별도 전달 (git 추적 안 됨)

- `.env.local` (Anthropic API key 등)
- MCP 서버 OAuth 토큰 (Apollo, Supabase MCP, Gmail) — 새 PC에서 재로그인
- CSV 등 PII (`sps_buyers_*.csv`) — USB / 보안 클라우드

## 관련 파일
- `docs/SETUP_NEW_PC.md` — 새 PC setup 1회 절차
- `memory/feedback_file_save_location.md` — 모든 파일은 프로젝트 폴더 내부 정책
