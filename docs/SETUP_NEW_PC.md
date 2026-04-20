# 새 PC에서 작업 이어받기

이 프로젝트는 메모리(세션 간 동적 컨텍스트)를 `memory/` 폴더에 git 추적합니다. 다른 PC에서 작업을 이어받으려면 1회 setup이 필요합니다.

## 빠른 흐름 (이미 setup 완료된 PC)

```bash
git pull             # 메모리 + 코드 최신화
# Claude Code 세션 → 첫 멘트로 "이어서 작업하자" 또는 작업 지시
# (메모리는 자동 로드)
git add memory/ && git commit -m "..." && git push   # 작업 끝나고
```

## 사전 조건
- Git, Node.js, npm 설치
- Claude Code (CLI 또는 IDE 확장) 설치

## Setup (1회)

### 1. 레포 clone
```bash
git clone <repo-url> "<프로젝트 루트>"
cd "<프로젝트 루트>"
npm install
```

### 2. Claude 메모리 자동 로드 활성화 (Junction)

Claude Code는 메모리를 다음 시스템 경로에서 자동 로드합니다:
```
C:\Users\<username>\.claude\projects\<프로젝트 슬러그>\memory\
```

이 경로를 프로젝트의 `memory/` 폴더로 가리키게 하면 git pull로 받은 메모리가 자동 로드됩니다.

**Windows (PowerShell, 관리자 권한 불필요)**
```powershell
$claudeMemory = "C:\Users\$env:USERNAME\.claude\projects\<프로젝트 슬러그>\memory"
$projectMemory = "<프로젝트 루트>\memory"

# 기존 .claude 메모리가 있으면 백업
if (Test-Path $claudeMemory) {
  Rename-Item $claudeMemory "memory.bak.$(Get-Date -Format yyyy-MM-dd)"
}

# Junction 생성 (.claude → 프로젝트 memory)
$claudeParent = Split-Path $claudeMemory -Parent
New-Item -ItemType Directory -Path $claudeParent -Force | Out-Null
New-Item -ItemType Junction -Path $claudeMemory -Target $projectMemory
```

**macOS / Linux (심볼릭 링크)**
```bash
CLAUDE_MEMORY="$HOME/.claude/projects/<프로젝트 슬러그>/memory"
PROJECT_MEMORY="$(pwd)/memory"

[ -d "$CLAUDE_MEMORY" ] && mv "$CLAUDE_MEMORY" "$CLAUDE_MEMORY.bak.$(date +%Y-%m-%d)"
mkdir -p "$(dirname "$CLAUDE_MEMORY")"
ln -s "$PROJECT_MEMORY" "$CLAUDE_MEMORY"
```

### 3. 환경변수 설정 (별도 — git 추적 안 됨)
- Supabase: `SUPABASE_ACCESS_TOKEN` (PAT)
- 그 외 secrets는 `docs/RUNBOOK.md` 참조 + Supabase Dashboard / Vercel 환경변수에서 직접 등록

### 4. 검증
```bash
# 메모리 파일이 양쪽 경로에서 동일한지 확인
diff -q ~/.claude/projects/<슬러그>/memory/ ./memory/
# 출력이 비어있으면 OK

# Claude Code 새 세션 시작 → MEMORY.md가 자동 로드되는지 확인
```

## 작업 흐름 (양쪽 PC에서)

1. 작업 시작: `git pull` (메모리 + 코드 최신화)
2. Claude Code 세션: 평소처럼 작업. 메모리 갱신은 자동으로 양쪽 경로에 반영 (junction 덕분에)
3. 작업 종료: `git add memory/ && git commit && git push`

## 주의사항

- **CSV 등 PII 파일은 git 제외** (`.gitignore`에 `sps_buyers_*.csv` 등록됨). 다른 PC로 옮길 땐 별도 수단(USB, 보안 클라우드)으로 전달.
- **`.env.local`도 git 제외**. 새 PC에서 직접 작성.
- 메모리에 secret 값(API key 실제 값) 절대 적지 말 것 — 변수명/digest만 기록.

## 별도 전달 필요 (git에 없음)

| 항목 | 방법 |
|---|---|
| `.env.local` (Anthropic/Supabase API key 등) | 보안 클라우드 또는 새 PC에서 재발급 |
| MCP 서버 OAuth (Apollo, Supabase MCP, Gmail) | 새 PC에서 OAuth 재로그인 / PAT 재발급 |
| CSV 파일 (`sps_buyers_*.csv`, 담당자 PII 포함) | USB / 보안 클라우드 |
| Vercel 환경변수 (`PIPEDRIVE_API_TOKEN` 등) | Vercel Dashboard에 이미 등록됨 — 새 PC 영향 없음 |
| Supabase Edge Function 환경변수 (`PERPLEXITY_API_KEY` 등) | Supabase Dashboard에 이미 등록됨 — 새 PC 영향 없음 |

## 동시 작업 주의

- 같은 시점에 PC A와 PC B에서 모두 메모리 갱신 → git conflict 발생
- 권장 패턴: 한쪽 작업 완료 → push → 다른 쪽 pull → 그 다음 작업 시작
- conflict 발생 시 Claude는 어느 버전 우선할지 사용자에게 물어보고 결정

## 현재 PC 정보 (origin 기준 — 2026-04-20 setup)

- **OS**: Windows 10 Pro
- **사용자명**: `신동환` (한글) — 다른 PC에서 사용자명 다르면 setup 시 `<username>` 자리 본인 것으로 변경
- **프로젝트 슬러그**: `c--Users-----Desktop-Claude-app-spscos` (Claude Code가 자동 생성. 프로젝트 절대경로 기반이므로 다른 PC에서 다른 경로면 슬러그도 다름)
- **새 PC에서 슬러그 확인 방법**: Claude Code 한 번 실행 후 `~/.claude/projects/` 디렉토리 확인하면 자동 생성된 슬러그 보임
