---
name: 생성 파일 저장 위치
description: 모든 프로젝트 관련 파일(CSV·메모리·문서)은 프로젝트 폴더 내부에 분류 저장. 다른 PC에서 git pull로 작업 이어받기 위한 정책
type: feedback
originSessionId: aa970480-04ca-4a6a-a73a-b686db6dc218
---

이 프로젝트와 관련된 모든 파일은 `c:\Users\신동환\Desktop\Claude\app-spscos\` 내부에 분류해서 저장한다. **C:\temp 같은 외부 경로 + .claude 시스템 경로는 직접 사용 금지.**

**Why:** Teddy가 다른 PC에서도 git pull로 작업을 이어받기 위해 (2026-04-20 요청). 프로젝트 외부에 파일이 흩어지면 동기화 불가 + 세션 간 연속성 깨짐. 메모리도 동일 — `memory/` 폴더에 git 추적되어야 새 PC에서 컨텍스트 복원 가능.

**How to apply:**
- **CSV/데이터**: 루트 또는 `data/` 폴더 (단 PII 포함 시 `.gitignore` 등록 — `sps_buyers_*.csv` 패턴)
- **문서**: `docs/` (영구 결정·아키텍처·런북·setup)
- **스프린트 산출물**: `sprints/`
- **메모리**: `memory/` 폴더 (git 추적). `.claude` 시스템 경로는 junction으로 이 폴더를 가리킴 — Write/Edit 시 프로젝트 `memory/` 경로에 작성하면 자동 로드도 동작
- **Secret 값 절대 기록 금지** — 메모리에는 환경변수명/digest만, 실제 값은 Supabase Dashboard / Vercel env

**새 PC setup 절차:** `docs/SETUP_NEW_PC.md` 참조. junction 1회 생성으로 자동 로드 + git 추적 양립.
