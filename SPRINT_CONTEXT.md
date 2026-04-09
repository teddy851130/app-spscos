# SPS 웹앱 스프린트 컨텍스트 (GSD — Global State Document)
> 컨텍스트 rot 방지용 마스터 문서. 새 세션 시작 시 반드시 이 파일부터 읽을 것.

## 현재 상태
- **스프린트**: Sprint 3 ✅ 완료 (Playwright 10/10)
- **앱 위치**: `/sessions/magical-vibrant-galileo/app-spscos-build/` (빌드/실행 디렉토리)
- **소스 위치**: `/sessions/magical-vibrant-galileo/mnt/Claude/app-spscos/` (영구 저장)
- **실행 포트**: 3333 (localhost:3333)
- **playwright.config.ts**: port 3333, reuseExistingServer: true
- **마지막 업데이트**: 2026-04-06
- **빌드 상태**: ✅ 완료 (TypeScript strict 오류 없음)
- **Supabase 연결**: ✅ 설정 완료

## ⚠️ 서버 실행 방법 (중요)
```bash
cd /sessions/magical-vibrant-galileo/app-spscos-build
# 서버 시작 (포트 3333)
node_modules/.bin/next dev --port 3333 > /tmp/nextjs.log 2>&1 &
# 준비 확인
curl -s -o /dev/null -w "%{http_code}" http://localhost:3333
# 테스트 실행
npx playwright test tests/sps.spec.ts
```
> ❌ 절대 포트 3000으로 실행하지 말 것 (playwright.config.ts가 3333 고정)
> ❌ node_modules를 /mnt 에서 설치하지 말 것 (ENOTEMPTY 오류)

## 완료된 기능 (Sprint 1 + 2 + 3)

### 구현된 페이지 (6개)
| 페이지 | 상태 | 주요 기능 |
|--------|------|-----------|
| 대시보드 | ✅ | KPI 카드 4개, 차트, 회신 피드, 팀별 현황, 경고 배너 |
| 파이프라인 | ✅ | 직원 A→B→C→D→E 5단계 애니메이션, 실행 버튼 |
| 바이어 DB | ✅ | Supabase 연결, 바이어 추가 모달, 상태 드롭다운 |
| 이메일 로그 | ✅ | 초안 생성(지역/Tier별 템플릿), Supabase 저장 |
| KPI 리포트 | ✅ | GCC/USA/Europe 팀별 지표 |
| 도메인 상태 | ✅ | SPF/DKIM/DMARC 표시 |

### 기술 스택
- Next.js 14.2.29 (App Router)
- React 18 + TypeScript
- Tailwind CSS v3
- Supabase (환경변수 .env.local 참조)
- 목업 데이터 fallback (Supabase 실패 시 자동)

## 비즈니스 규칙 (절대 변경 금지)
- MOQ: 3,000개 이상
- ICP Tier 1: $50M~$500M 매출, 500+명
- ICP Tier 2: $5M~$50M 매출, 50~500명
- Tier 3: 발굴 스킵
- 지역: GCC / USA / Europe (UK+France+Germany)
- BCC: spscos@pipedrivemail.com (회신 시 자동 기록)
- CEO: 신동환 | teddy@spscos.com
- 직원: A(발굴) → B(검증) → C(이메일작성) → D(스팸테스트) → E(발송+BCC) → F(모니터링)

## Supabase 설정
- URL: .env.local의 NEXT_PUBLIC_SUPABASE_URL 참조
- anon key: .env.local의 NEXT_PUBLIC_SUPABASE_ANON_KEY 참조
- 스키마: supabase/schema_fix.sql (실행 완료 ✅)
- 샘플 데이터: supabase/sample_data.sql (⚠️ 아직 미실행 — 신동환 대표 직접 실행 필요)

## 남은 작업

### [신동환 대표 직접 실행 필요]
1. Supabase sample_data.sql 실행
   - Supabase Dashboard → SQL Editor
   - supabase/sample_data.sql 내용 붙여넣기 → Run
2. GitHub 리포지토리 생성 (app-spscos)
3. Vercel 배포 → app.spscos.com 도메인 연결

### [Sprint A — Vercel 배포]
- [ ] GitHub push (사용자 직접)
- [ ] Vercel import → env 변수 설정
- [ ] app.spscos.com DNS 연결

### [완료된 Sprint]
- ✅ Sprint 1: 기본 UI (6페이지, 다크테마)
- ✅ Sprint 2: Supabase 연결
- ✅ Sprint 3: 기능 확장 (바이어 추가, 이메일 초안, 파이프라인 실행) — Playwright 10/10

