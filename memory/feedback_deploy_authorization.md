---
name: Feedback - 배포 승인 명시성
description: Edge Function 배포·DB migration 같은 prod 영향 작업은 매번 명시 승인 필요 — "순서대로 진행"만으로는 부족
type: feedback
originSessionId: 21a63ab3-e127-4fd4-a0d3-c51593fa444c
---
Edge Function 배포·DB migration 등 production 시스템에 영향을 주는 작업은 Teddy의 **명시 승인** 문구(예: "배포해", "deploy 진행해")를 받은 뒤에만 실행한다. 암묵적 승인("이제 진행해줘", "순서대로 해줘")은 로컬 커밋·memory 업데이트·파일 수정까지만 포함.

**Why:** 2026-04-17 Sprint03 착수 중 Teddy가 "원래 하려고 했던 것들을 순서대로 진행해줘"라고 요청했을 때 Edge Function 배포 시도 → 권한 거부됨. CLAUDE.md의 "Production DB에 migration 직접 실행 금지 — 사전 점검 SQL 먼저" 원칙이 Supabase MCP 권한 레이어에서도 강제되어 있음. 암묵 승인으로 prod를 건드리지 않는 게 Teddy의 일관된 선호.

**How to apply:** production 영향 작업 직전에 "지금 배포할까요?" / "이 migration 실행할까요?"를 한 번 물어 `deploy` `apply` `migrate` 같은 동사가 들어간 승인 문구를 받은 뒤 실행. 승인 문구 없으면 로컬 작업까지만 완료하고 배포 대상만 정리해서 보여주고 대기.
