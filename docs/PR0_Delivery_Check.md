# PR0 — 발송 인프라 점검 가이드

> Sprint04의 **첫 블로커 관문**. 본문 품질 개선(PR17/PR18)이 아무리 좋아도
> 메일이 Gmail Promotions/Spam 탭에 떨어지면 회신 0. 월요일 오전 15~20분 투자로
> 이후 1주일의 모든 작업이 헛수고인지 아닌지 판정한다.
>
> 작성: 2026-04-20 · 대상: Teddy (비개발자 기준) · 실행 조건: Teddy 단독

---

## 실행 순서 (A → B → C → D)

### A. 자기 앞 테스트 발송 (5분)

1. Teddy 개인 Gmail (예: `teddy.co.kr@gmail.com`) 열어두기
2. SPS 앱(app.spscos.com) 또는 Gmail 회사 계정(teddy@spscos.com)으로 **2~3통** 테스트 메일을 자기 개인 Gmail 앞으로 발송
   - 이미 4/20 측정에서 **5통 중 4통 Primary, 1통 Spam (80%)** 확인됨
   - 재측정 목적: PR18(본문 튜닝) 배포 **이후**에 다시 2~3통 보내 개선 여부 판정
3. 10분 대기 후 Gmail 탭 확인
   - **Primary (기본)**: 좋음 ✅
   - **Promotions (프로모션)**: 경계 ⚠️
   - **Spam (스팸)**: 구조적 실패 ❌

### B. DMARC 리포트 재확인 (5분)

EasyDMARC 대시보드 로그인 → spscos.com 도메인 리포트.
| 항목 | 기대값 | 4/20 실측 |
|------|--------|----------|
| SPF Pass | 100% | ✅ 100% |
| DKIM Pass | 100% | ✅ 100% |
| DMARC Aligned | Pass | ✅ Aligned |
| Blacklisted IP | 0건 | ⚠️ 1건 (Google 공유 IP `209.85.208.47`, 개인 해결 불가, 영향 0.76%) |

**해석**: 인증 측(SPF/DKIM/DMARC)은 완벽. Primary 80% 문제는 **콘텐츠/평판** 쪽.

### C. 판정 기준 (1분)

Primary 도달률에 따라 분기:

| 결과 | 판정 | 다음 행동 |
|------|------|----------|
| **5/5 Primary (100%)** | OK | PR16~19 그대로 진행 |
| **3~4/5 Primary (60~80%)** | 경계 | 진행 OK, 단 **PR18 배포 후 재측정 필수** (토 1차 발송 전) |
| **≤2/5 Primary (≤40%)** | **STOP** | 아래 D 단계 병행 작업 착수 |

### D. STOP 시 병행 작업 (≤2/5만 해당)

현재 Primary **4/5 = 80%** 이므로 STOP 아님. 아래는 미래 참조용.

#### D-1. DMARC 리포트별 분기

EasyDMARC에서 Fail 원인 확인:

- **SPF soft-fail** → Google Workspace 관리 콘솔 `Apps → Google Workspace → Gmail → Default routing` 확인. DNS TTL 대기 필요 시 `dig TXT spscos.com` (또는 mxtoolbox.com/spf.aspx)로 재조회.
- **DKIM 서명 누락** → `Apps → Google Workspace → Gmail → Authenticate email → Generate new record` 경로로 DKIM 키 재발행 후 DNS `default._domainkey.spscos.com` TXT 레코드 갱신.
- **DMARC rua 미설정** → DNS `_dmarc.spscos.com` TXT 레코드에 `v=DMARC1; p=none; rua=mailto:reports@spscos.com` 추가. 이미 EasyDMARC 연결됐다면 rua는 자동 설정됨.

#### D-2. STOP 유예 기간 병행 작업

- PR17 AI 냄새 프롬프트 튜닝 **local dry-run**만 허용 (prod 배포 금지)
- 실측 스팸 메일(Trinny London 건) 7개 트리거로 회귀 테스트
- 5/3경 DMARC `p=none` → `p=quarantine` 상향 예정 (메모리 기록, 2주 주기)

---

## 확인 명령 (Windows PowerShell)

DNS 조회용. Teddy가 직접 실행하지 않아도 되나, 다음 세션에서 Claude가 참고:

```powershell
# SPF 확인
nslookup -type=TXT spscos.com

# DMARC 정책 확인
nslookup -type=TXT _dmarc.spscos.com

# DKIM 확인
nslookup -type=TXT default._domainkey.spscos.com
```

온라인 조회: https://mxtoolbox.com/SuperTool.aspx — spscos.com 입력 후 `MX Lookup`, `SPF Record Lookup`, `DMARC Lookup` 각 실행.

---

## PR0 완료 판정

- [ ] A 자기 앞 재측정 (PR18 배포 후 토 발송 전 필수)
- [ ] B EasyDMARC 리포트 확인 (4/20 완료)
- [ ] C 판정 결과 기록 → `memory/project_sps_sprint04.md`
- [ ] (STOP 시) D-1·D-2 착수

---

## 현재 상태 (2026-04-20 18:00 기준)

- A 1차 측정: **4/5 Primary (80%)** → 경계. PR18 배포 후 재측정 필수.
- B DMARC: SPF/DKIM/DMARC 모두 Pass. 블랙리스트 1건(Google 공유 IP, 영향 0.76%).
- C 판정: **경계 — 진행 OK, 단 PR18 이후 Primary 재측정 의무**.
- D: 미착수 (STOP 아님).
