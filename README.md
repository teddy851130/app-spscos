# SPS International 바이어 발굴 웹앱

**프로젝트명**: SPS International Buyer Discovery Platform v1.0
**개발**: Claude Code
**상태**: Sprint 1 완료 (코드 100%, 빌드 대기)

---

## 빠른 시작

### 설치
```bash
npm install
```

### 개발 서버 실행
```bash
npm run dev
# http://localhost:3000 접속
```

### 빌드
```bash
npm run build
npm run start
```

### 미리보기 (npm 설치 전)
```bash
# preview.html을 브라우저에서 열기
```

---

## 프로젝트 개요

한국 화장품 OEM/ODM 중개회사 SPS International의 자동화된 바이어 발굴 웹앱

### 주요 기능
- 📊 실시간 KPI 대시보드
- ⚡ 5단계 파이프라인 시각화
- 🏢 바이어 DB 관리
- 📧 이메일 추적
- 📈 팀별/Tier별 분석
- 🛡️ 도메인 인증 모니터링

---

## 기술 스택

- Next.js 14 (App Router)
- React 19
- TypeScript 5
- Tailwind CSS 4 (다크 테마)

---

## 구현된 페이지

1. **대시보드** - KPI 카드, 차트, 팀 현황
2. **파이프라인** - 5단계 프로세스 진행 상황
3. **바이어 DB** - 바이어 테이블 + 필터
4. **이메일 로그** - 발송 추적
5. **KPI 리포트** - 팀별 분석
6. **도메인 상태** - SPF/DKIM/DMARC

---

## 디렉토리 구조

```
app-spscos/
├── app/components/     # 7개 페이지 컴포넌트
├── app/layout.tsx      # 루트 레이아웃
├── app/page.tsx        # 메인 페이지
├── app/globals.css     # 글로벌 스타일
├── preview.html        # 정적 미리보기
├── SPRINT_CONTEXT.md   # GSD 문서
└── sprints/            # 스프린트 계획 & 리포트
```

---

## 현재 상태

- ✅ 코드 구현 100% (7개 페이지)
- ✅ 스타일 구현 100% (다크 테마)
- ✅ 문서화 100%
- ⏳ npm install (node_modules 캐시 이슈)
- ⏳ 빌드 테스트

---

## 다음 단계

1. npm install 해결
2. npm run build 실행
3. npm run dev (개발 서버)
4. Playwright 검증

---

자세한 정보:
- `SPRINT_CONTEXT.md` - GSD 및 프로젝트 컨텍스트
- `sprints/Sprint01_Final_Report.md` - 최종 리포트
- `preview.html` - 정적 UI 미리보기

**Status**: 🟡 Sprint 1 완료, 빌드 테스트 대기
