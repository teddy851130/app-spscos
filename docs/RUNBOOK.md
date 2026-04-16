# 배포·롤백·트러블슈팅 런북

> 실전 운영 시 참조. 새 세션에서 Claude가 배포 작업할 때 이 문서부터 확인.

---

## 일반 배포 순서

### 케이스 A: 프론트엔드만 변경
1. 로컬 `npx tsc --noEmit` 통과 확인
2. `git add` → `git commit` → `git push origin main`
3. Vercel이 2~3분 내 자동 배포 (Deployments 탭에서 확인)
4. `app.spscos.com`에서 기능 확인

### 케이스 B: Supabase migration 포함
1. 로컬 tsc 통과 확인
2. **Supabase SQL Editor → 사전 점검 SQL 먼저 실행** (migration 파일 상단 주석 참고)
3. 결과 확인 후 백업 테이블 생성:
   ```sql
   CREATE TABLE <name>_backup_<pr> AS SELECT * FROM <name>;
   ```
4. migration SQL 본문 실행 → "Success"
5. `NOTIFY pgrst, 'reload schema';` 실행 (컬럼 추가/제거 시 필수 — 이 단계 누락 시 프론트 조회 실패)
6. GitHub push → Vercel 자동 배포
7. 검증

### 케이스 C: Edge Function 변경 포함
1. 케이스 B 단계 + Supabase Dashboard → Edge Functions
2. 수정된 함수 선택 → 코드 에디터에 최신 버전 붙여넣기 → **Deploy**
3. Functions Logs 탭에서 첫 호출 시 에러 없는지 확인
4. 검증

---

## 롤백 절차

### 코드 롤백 (Vercel)
- Vercel Dashboard → Deployments → 이전 배포 선택 → **"Promote to Production"**

### Supabase migration 롤백
- 각 migration에 `_rollback.sql` 파일 존재 (예: `008_pr1_data_integrity_rollback.sql`)
- SQL Editor에서 실행
- 주의: UNIQUE 제약 추가 전 DELETE로 중복 정리한 경우 → 삭제된 row는 복구 안 됨. 백업 테이블 필수.

### Edge Function 롤백
- GitHub에서 이전 커밋의 파일 내용 복사 → Supabase Dashboard에서 재배포
- 또는: `git checkout <prev-commit> -- supabase/functions/<name>/index.ts` → 수동 붙여넣기

---

## Claude Code 프로젝트 설정 (1회성)

### Supabase MCP PAT 발급 + 환경변수

프로젝트 레포에 `.mcp.json` + `.claude/settings.json` 이 포함되어 있어 VS Code에서 이 폴더를 열면 자동 활성. 단 **Supabase Access Token은 대표님 PC에 환경변수로 설정**해야 MCP가 실제로 동작.

**1. PAT 발급**
- https://supabase.com/dashboard/account/tokens → "Generate new token" → 이름 `claude-code-sps` → `sbp_xxxxx` 토큰 복사 (한 번만 표시)

**2. Windows 환경변수 설정**
- PowerShell (영구 저장):
  ```powershell
  [Environment]::SetEnvironmentVariable('SUPABASE_ACCESS_TOKEN', 'sbp_xxx실제토큰', 'User')
  ```
- 또는 Win+R → `sysdm.cpl` → 고급 → 환경 변수 → 사용자 변수 → 새로 만들기: `SUPABASE_ACCESS_TOKEN` / `sbp_xxx`

**3. VS Code 재시작**
- File → Open Folder → `app-spscos` (프로젝트 폴더 자체)
- Claude Code 사이드바 재시작
- "Allow Supabase MCP?" 프롬프트 → Allow
- 세션 시작 시 "🧠 SPS 바이어 웹앱 세션 시작..." 안내 메시지 확인

**4. 동작 확인**
- Claude에게 "Supabase MCP 연결됐어? `buyers` 테이블 행 수 확인해줘" 요청
- MCP 응답이 돌아오면 셋업 완료

### 셋업 완료 후 가능한 것
- Migration 자동 실행 (SQL Editor 붙여넣기 불필요)
- `SELECT` 쿼리로 실시간 데이터 조회
- `NOTIFY pgrst, 'reload schema';` 자동 실행
- Edge Function 재배포는 여전히 수동 (Dashboard 필요)

---

## 환경변수 (Supabase Secrets)

Edge Functions 필수:
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` (자동 주입)
- `ANTHROPIC_API_KEY` — Claude API (직원 C, D, E 보조)
- `ZEROBOUNCE_API_KEY` — 이메일 검증 (직원 B)
- `SMTP_HOST` (smtp.gmail.com)
- `SMTP_PORT` (587 = STARTTLS, 465 = SSL)
- `SMTP_USER` (teddy@spscos.com)
- `SMTP_PASS` (Gmail 앱 비밀번호 16자 — 공백 제거 필수)

Vercel 필수:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## 자주 발생하는 문제

### "Edge Function returned a non-2xx status code"
- **원인**: `supabase.functions.invoke` 사용 시 실제 에러 숨김 (ADR-009)
- **해결**: direct fetch로 교체 → 실제 `data.error` 메시지 노출
- **이미 교체된 경로**: send-email, generate-draft(generate_ko / translate_only / translate_save)
- **남은 경로 발견 시**: `EmailComposeModal.tsx` 의 direct fetch 패턴 복사

### 바이어 DB에 담당자 정보 안 보임
- **원인**: `buyer_contacts` RLS SELECT 정책 누락
- **확인**:
  ```sql
  SELECT policyname, cmd FROM pg_policies WHERE tablename = 'buyer_contacts';
  ```
- **해결**: migration 010 실행 — `CREATE POLICY "read buyer_contacts" ON buyer_contacts FOR SELECT USING (true);`

### 파이프라인 "실행 중" 영원히 고착
- **원인**: Edge Function 타임아웃 / finally 블록 미실행
- **해결**: Pipeline 페이지 → 해당 팀 카드의 **"재시도" 버튼** (10분 초과 자동 노출)
- **로그 확인**: `SELECT status, error_log, started_at FROM pipeline_jobs ORDER BY created_at DESC LIMIT 5;`

### 인텔 없어 발송 불가 (intel_failed)
- **확인**: `SELECT id, company_name, status, analysis_failed_at, intel_score FROM buyers WHERE status = 'intel_failed';`
- **재분석 강제**:
  ```sql
  UPDATE buyers
  SET analysis_failed_at = NULL, intel_score = NULL, status = 'Cold'
  WHERE id = '<bid>';
  ```
- 다음 파이프라인 실행에서 직원 C가 재분석

### EmailComposeModal "발송 가능한 영문 초안 없음" 배너
- **원인**: 직원 D가 초안 미생성 OR spam_status != 'pass'/'rewrite'
- **해결**: 모달의 **"바이어 인텔" 탭** → "국문 초안 생성" → "영문에 반영 및 검증"

### "검증 대기 중" 배지가 지속됨
- **원인**: `email_drafts.spam_status = null` 상태. 직원 E가 아직 검증 안 함.
- **즉시 해결**: 영문 탭의 **"저장 및 재검증"** 버튼 클릭 (validate-draft Edge Function 호출).
- **일괄 해결**: Pipeline 페이지에서 파이프라인 실행 → agentE가 `spam_status=null` 초안 일괄 처리.

### 국문에서 수정한 내용이 영문에 반영 안 됨 / 일부 누락
- **원인**: Claude가 B2B 맥락상 "부적절"로 판단한 문장을 자체 제거 (PR6.5 사례: "저는 당신을 미워합니다" 누락).
- **완화**: PR6.6에서 generate-draft 프롬프트를 "Axis 1 CONTENT PRESERVATION strict" + "Axis 2 STYLE POLISH" 2축 분리로 강화. 그래도 Claude 안전 정책상 명백한 hateful 표현은 제거될 수 있음.
- **임시 우회**: 해당 문장을 영문 탭에서 직접 편집 → "저장 및 재검증".

### rewrite 후 영문 본문 문단 구조(줄바꿈) 파괴
- **원인**: PR6.7 이전의 `autoFixSpam` 정규식 `\s{2,}`가 `\n`까지 압축 → 빈 줄·signature가 단일 공백으로 평탄화.
- **해결**: PR6.7에서 `[ \t]{2,}`로 변경. **Edge Function 재배포 필수** (validate-draft + run-pipeline 둘 다).
- **확인**: rewrite 케이스 재현 (본문에 "free" 같은 스팸 단어 포함 → 저장 및 재검증) → 문단 유지되면 OK.

### 스키마 변경 후 프론트에서 컬럼 못 찾음
- **원인**: PostgREST 스키마 캐시 미갱신
- **해결**: `NOTIFY pgrst, 'reload schema';` (SQL Editor)

### 테스트 발송이 SMTP에서 거절
- **확인 순서**:
  1. Supabase Edge Functions → send-email → Logs 탭에서 실제 에러
  2. `SMTP_PASS` 16자 공백 포함 여부 (공백 반드시 제거)
  3. Gmail 계정 2단계 인증 + 앱 비밀번호 활성 여부
  4. teddy@spscos.com 일일 발송 한도 (Gmail 무료: 500통)

---

## 신규 migration 작성 시 사전 점검 SQL 템플릿

```sql
-- 1. 영향받을 행 수 확인
SELECT COUNT(*) FROM <table> WHERE <조건>;

-- 2. 백업 테이블 생성 (롤백 대비)
CREATE TABLE <table>_backup_<pr> AS SELECT * FROM <table>;

-- 3. 제약 조건 확인 (CHECK / UNIQUE 변경 시)
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint WHERE conrelid = '<table>'::regclass;

-- 4. 인덱스 확인
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = '<table>';

-- 5. RLS 정책 확인
SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = '<table>';
```

---

## 관련 문서
- [ARCHITECTURE.md](ARCHITECTURE.md) — 시스템 구조
- [DECISIONS.md](DECISIONS.md) — ADR 목록
- [../CLAUDE.md](../CLAUDE.md) — Claude 작업 지침
