---
name: Feedback - 콜드메일 서명 규약
description: 콜드메일 서명은 5줄 풀 블록 + Managing Director 직책 + 이모지 미사용. 근거와 대안 기각 이유 기록
type: feedback
originSessionId: 5102fe5a-88a1-4a93-bc09-c3617f9638da
---
서명은 단독 이름(예: "Teddy")이 아니라 **회사명·직책·전체 연락처·등록 주소**를 포함한 5줄 풀 블록. 이모지 없음.

**확정 블록 (2026-04-21, PR17.1/ADR-044)**:
```
Warm regards,

Teddy Shin
Managing Director, SPS International
Email: teddy@spscos.com  |  Web: spscos.com  |  Mobile: +82 10 4409 0963
8 Myeongdal-ro 22-gil, Seocho-gu, Seoul 06668, Republic of Korea
```

**Why**: GCC/USA/EU B2B 바이어에게 legitimacy 전달에 필요한 요소 전체를 서명 한 블록으로 노출. 단독 이름 서명은 "누군지 확인 불가" → 스팸 의심도 상승. 회사명+직책+등록 주소는 "실재 회사" 신호.

- **직책 Managing Director 선택 근거**: CEO/Founder 지양(회사 규모 부담 우려 — Teddy 피드백). Managing Director는 GCC·아랍권에서 CEO보다 더 보편·권위 있는 표기. 국제 B2B 중립 포지션.
- **이모지 미사용 근거**: Gmail/Outlook 스팸 필터가 본문·서명 이모지 카운트에 가중치. B2B 콜드메일 베스트 프랙티스는 텍스트 서명. Teddy 조건부 수용("영향 있으면 쓰지 말고") 보수적 해석.
- **주소 영문 포맷**: 한국식 `/06668` 뒤첨자 지양. 국제 표준 `Seoul 06668, Republic of Korea`.

**How to apply**:
- generate-draft `translate_save` 프롬프트 `SIGN-OFF RULE`에 5줄 블록 verbatim 포함
- (agentD는 PR18/ADR-046으로 제거됨 — 이전 히스토리 참조용)
- 새 UI/템플릿에서 발신 정보 표시 시 같은 좌표 사용 (예: `EmailComposeModal` "발신" 라벨은 "Teddy Shin <teddy@spscos.com>")
- 좌표 자체는 `memory/reference_sps_infra.md` "콜드메일 서명 좌표" 섹션에 수록
- 블록 변경이 필요하면 translate_save 프롬프트 + reference_sps_infra.md 두 곳 동기 갱신
- MAX_WORDS를 설정할 때 서명 ~30단어 + 본문 120~150 = **180** 상한 지킬 것. 서명 빼고 본문만 150이면 실제 출력이 180 넘어 validate-draft flag.
