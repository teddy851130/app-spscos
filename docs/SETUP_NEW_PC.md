# 새 PC에서 작업 이어받기

이 프로젝트는 메모리(세션 간 동적 컨텍스트)를 `memory/` 폴더에 git 추적합니다. 다른 PC에서 작업을 이어받으려면 1회 setup이 필요합니다.

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
