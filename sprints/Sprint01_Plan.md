# Sprint 1 계획

## 목표
SPS International 바이어 발굴 웹앱 프로토타입 구현

## 범위

### 페이지 (6개)
1. **대시보드** - KPI 카드, 차트, 피드, 팀 현황
2. **파이프라인** - 5단계 프로세스 진행 상황
3. **바이어 DB** - 테이블 + 필터/검색
4. **이메일 로그** - 발송 기록 + 상태 추적
5. **KPI 리포트** - 팀별/Tier별 상세 지표
6. **도메인 상태** - SPF/DKIM/DMARC 현황

### 기술 스택
- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS (Dark Theme)
- 목업 데이터 (실제 DB 연동은 Sprint 2)

## 완료 기준
- [x] 모든 6개 페이지 구현
- [ ] npm run build 성공
- [ ] 반응형 레이아웃 (1280px+)
- [ ] 10라운드 Playwright 테스트 통과

## 구현 현황

### 완료된 컴포넌트
- ✓ Sidebar.tsx (네비게이션, 사용자 정보)
- ✓ Dashboard.tsx (KPI 카드, 차트, 피드)
- ✓ Pipeline.tsx (파이프라인 단계별 진행)
- ✓ Buyers.tsx (바이어 테이블, 필터)
- ✓ Emails.tsx (이메일 로그, 상세 뷰)
- ✓ KPIReport.tsx (팀별/Tier별 분석)
- ✓ Domain.tsx (도메인 상태, 인증서)

### 파일 구조
```
app-spscos/
├── app/
│   ├── components/
│   │   ├── Sidebar.tsx
│   │   ├── Dashboard.tsx
│   │   ├── Pipeline.tsx
│   │   ├── Buyers.tsx
│   │   ├── Emails.tsx
│   │   ├── KPIReport.tsx
│   │   └── Domain.tsx
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── package.json
└── tsconfig.json
```

## 일정
- 시작: 2026-04-06 21:30 UTC
- 목표 완료: 2026-04-06 23:00 UTC
- 현재 상태: 코드 구현 100%, 빌드 테스트 대기

## 다음 단계
1. npm install 해결 (node_modules 캐시 이슈)
2. npm run build 실행
3. npm run dev (개발 서버 실행)
4. Playwright 테스트 작성 및 10라운드 검증
5. 최종 리포트 작성

## 리스크 & 완화 방안
| 리스크 | 영향 | 완화 방안 |
|------|------|----------|
| npm install 시간초과 | 높음 | 새 디렉토리 또는 --prefer-offline |
| 차트 라이브러리 의존 | 중간 | SVG 기반 차트로 대체 |
| 빌드 에러 | 높음 | TypeScript 타입 검사 강화 |

---

**Status**: 🟡 In Progress
