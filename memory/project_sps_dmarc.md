---
name: Project - DMARC 정책 단계적 상향
description: 2026-04-19 EasyDMARC 연결 완료 (p=none 모니터링) · 2~4주 후 quarantine → 2~3개월 reject로 상향 예정
type: project
originSessionId: 1372e097-d166-4b77-b083-17910ae8da4a
---
## 현재 상태 (2026-04-19)

- **EasyDMARC 연결 완료** — spscos.com 도메인 Verify 성공. MSP trial 가입 (teddy@spscos.com Google 계정 로그인).
- 가비아 `_dmarc` TXT 레코드:
  ```
  v=DMARC1; p=none; rua=mailto:40694b308d@rua.easydmarc.asia; ruf=mailto:40694b308d@ruf.easydmarc.asia; fo=1;
  ```
- **첫 DMARC 리포트는 24시간 내 도착 예정**

## 이전에 있던 DMARC 중복 문제 (해결됨)

- 삭제 전 가비아에 TXT 2개 공존 (`p=quarantine` + `p=none;`) → RFC 7489 위반으로 일부 수신 서버가 DMARC 자체를 무시하던 상태
- **Why:** 과거 Teddy가 `p=quarantine`으로 설정 후, 어디선가 자동으로 `p=none;` 레코드가 추가됐었음 (출처 불명)
- **How to apply:** 앞으로 DMARC TXT 레코드 수정 시 반드시 **기존 레코드가 1개뿐인지** 먼저 확인

## 왜 CNAME 방식(EasyDMARC Managed)이 아닌 TXT 방식으로 갔는지

- 가비아 DNS가 **CNAME 값의 언더스코어(`_`)를 엄격 검증하여 거부** — `_dmarc.spscos_com._d.easydmarc.pro` 형식 입력 불가
- **Why:** DNS 표준상 hostname에 `_`가 허용 안 되는 걸 가비아가 엄격히 체크함 (국내 DNS 호스트의 공통 제약)
- **How to apply:** 다른 DMARC/DKIM 관리 서비스를 SPS에 추가할 때도, CNAME 방식이면 가비아 호환성 먼저 점검

## 정책 단계적 상향 로드맵

| 단계 | 시점 | 정책 | 조건 |
|------|------|------|------|
| 1 (현재) | 2026-04-19 | `p=none` | EasyDMARC 대시보드에서 SPF/DKIM 통과율 확인 |
| 2 | 2026-05-03 이후 (2주) | `p=quarantine` | SPF 통과율 ≥ 95%, DKIM 통과율 ≥ 95% 확인 후 |
| 3 | 2026-06-19 이후 (2개월) | `p=reject` | quarantine 2~3주 안정 운영 + 정상 메일 스팸 처리 사례 없음 확인 후 |

**Why:** 갑자기 엄격 정책 적용 시 정상 메일이 스팸/거부 처리될 위험. 데이터 기반 점진적 상향이 업계 표준.
**How to apply:** 단계 변경은 **가비아 DNS에서 TXT 값 수정**으로 처리 (EasyDMARC Managed CNAME은 못 쓰므로). 정책 변경 전 반드시 EasyDMARC 대시보드의 Compliance Rate / SPF Pass / DKIM Pass 지표 먼저 확인.

**Google Calendar 리마인더 등록**: 2026-05-03 10:00 KST "DMARC p=quarantine 상향 검토 (SPS)" — 대시보드 확인 + 가비아 DNS TXT 수정 절차 description에 상세 기재.

## 후속 확인 필요 (이월)

### (1) EasyDMARC MSP Trial 만료 (2026-05-02경)
- 현재 MSP plan 13일 trial (2026-04-19 시작)
- **신용카드 미등록 상태 확인 완료 (2026-04-19)** — Plans and Billing > Billing and Payment Information 탭 비어있음
- **자동 과금 위험 없음**. Trial 만료 시 Free 플랜 자동 전환 or 서비스 일시 비활성화 (둘 다 요금 청구 없음)
- **UI상 수동 다운그레이드 버튼은 trial 상태에서 제공 안 함** (Upgrade만 있음) — 만료 대기가 정상 경로
- Google Calendar 리마인더 등록: **2026-05-03 09:00 KST "EasyDMARC Trial 만료 - 계정 상태 확인 (SPS)"**

### (2) pdrserv.com CNAME 정체 조사 (가비아 DNS)
- 가비아 DNS에 3개의 CNAME 미확인:
  - `pdn1tzeb1620._domainkey` → `pdn1tzeb1620.pdn12tzeb1620.pdrserv.com`
  - `pdn2tzeb1620._domainkey` → `pdn2tzeb1620.pdn22tzeb1620.pdrserv.com`
  - `pds.pdrserv` → `pds1tzeb1620.pds12tzeb1620.pdrserv.com`
- `pdrserv.com`은 **PowerDMARC(EasyDMARC 경쟁사)의 DKIM 위임 도메인**으로 추정
- **가능성:** (a) 과거 PowerDMARC 가입 후 방치 / (b) 다른 메일 서비스(메일침프, 세일즈 자동화 등)가 요구 / (c) Pipedrive 메일 연동
- **How to apply:** 다음 DNS 관련 작업 시 정체 확인. 실수로 삭제하면 해당 서비스 메일이 스팸 처리될 위험 → 반드시 정체 파악 후 처리
