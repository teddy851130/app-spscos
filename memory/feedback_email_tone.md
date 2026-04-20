---
name: Feedback - 콜드메일 톤 가이드
description: 직원 D 프롬프트가 지켜야 할 톤 규칙 — CIA 프레임워크 + Warm-Confident 톤 + 인사말 필수 + 반복 금지 어휘 + 스팸 판정 기준
type: feedback
originSessionId: 21a63ab3-e127-4fd4-a0d3-c51593fa444c
---
## 프레임워크 (ADR-024, ADR-025)
- **CIA** (Context - Insight - Ask) + **Warm-Confident** 톤.
- Challenger Sale의 "Take-control" 영어 직역은 한국어로 도발적·우월적으로 읽힘 → 금지.
- 구조: (0) 인사말 → (1) Context (고유명사 2+ 인용) → (2) Insight (업계 패턴 공유) → (3) SPS 전환 (겸손한 제안형) → (4) Ask (단일, 저부담, 정중) → (5) 서명 → (6) P.S. 링크

## 인사말 (필수, 2026-04-17 추가)
- 영문 첫 줄: `Dear ${contact_name},` (GCC·USA·Europe 모두 안전. Hi·Hello·이름만 쓰기는 금지)
- 국문 첫 줄: `안녕하세요, ${contact_name} 님.` 또는 `${contact_name} 님께,`
- 바로 본문 진입 금지.

## 금지 표현
- **감시형** ("관찰됩니다", "~인 것으로 보입니다", "저희가 분석한 바에 따르면", "~로 파악됩니다")
- **도발/단정형** ("대부분의 OEM은 그 속도로 움직이지 못합니다", "SPS는 정확히 그 지점을 위해 만들었습니다", "~ 겪지 않으셨으면 합니다")
- **객관식 4지선다** ("(a)/(b)/(c)/(d) 중 무엇인가요")
- **구체 숫자** (MOQ 3,000 / 납기 8주 / 퍼센트 / 가격 범위) — 첫 메일 협상 앵커로 역효과
- **세일즈 클리셰 15개**: unlock / synergy / leverage / game-changer / best-in-class / world-class / industry-leading / state-of-the-art / cutting-edge / revolutionary / next-level / positioned to / touch base / circle back / just wanted to (+한국어 번역·동의어)
- **경쟁자 직접 비하** ("unlike other manufacturers", "most OEMs fail at", "대부분의 제조사는 못 합니다")
- **반복 어휘** — partner/partnership/bespoke/turnkey/tailored 총 2회 초과 금지 (반복 시 세일즈 스크립트 냄새)

## 권장 표현 (금지 → 대체)
- "대부분의 OEM은 못 합니다" → "많은 제조사들이 이 부분에서 함께 고민하시는 걸 자주 보았습니다"
- "SPS는 정확히 그 지점을 위해 만들었습니다" → "SPS가 바로 이런 맥락에서 도움이 될 수 있지 않을까 싶습니다"
- "~ 겪지 않으셨으면 합니다" → "조금이라도 힘이 될 수 있다면 기쁜 마음으로 함께하겠습니다"
- "~ 확신합니다" → "~일 것 같습니다" / "~ 생각됩니다"
- "15분 내 주세요" → "편하신 때에 15분만 시간 내주실 수 있다면 감사하겠습니다"

## SPS 포지셔닝 키워드 (본문에 조심스럽게 반영)
- 빠른 진행과 회신 — 빠른 견적·샘플링, CEO 직접 응답
- 모든 화장품 카테고리(스킨케어·바디케어·컬러·헤어케어·프래그런스) 제조 파트너 네트워크
- 다국가 수출 경험 (GCC·USA·EU)
- 완전 맞춤형 풀턴키 — 가격·수량·퀄리티·디자인을 귀사 기준으로 설계
- 포뮬러·패키징·규제·물류 단일 파트너로 엔드투엔드

## Ask 문구 (정중·개방)
- 국문 예: `${company_name}의 다음 단계에 저희가 조금이라도 도움이 될 수 있을지, 편하신 때에 15분만 시간 내주실 수 있다면 감사하겠습니다.`
- 영문 예: `If a short 15-minute conversation might be useful to see whether SPS fits ${company_name}'s next chapter, I'd be glad to make the time whenever suits you.`
- 객관식·복수 질문 금지. 명령조 금지.

## 서명
- 영문: `Warm regards,\nTeddy` (콜드 1차는 full name + 직책보다 first name이 동료 톤)
- 국문: `Teddy 드림`

## P.S. 링크 (필수, ADR-024)
- 영문: `P.S. A 3-minute preview of what we do, if helpful: https://spscos.com/`
- 국문: `추신. 3분짜리 미리보기: https://spscos.com/`
- 홍보성 수식어 금지. 링크는 본문이 아닌 P.S.에 정확히 1개.
- 이 링크는 PR13의 클릭 추적 + CRM 자동 프로토콜 트리거 대상.

## Claude 스팸 판정 rubric (ADR-025)
agentE + validate-draft 공통. 이전 "Rate spam risk 1-10" 과잉 판정 방지:
- **10**: 자연스럽고 개인화된 peer-to-peer 톤
- **8-9**: 견고한 B2B 콜드메일 (기본값). 파트너십 톤·P.S. 단일 링크·15분 요청은 감점 X.
- **6-7**: template smell, hype, 반복 jargon, pushy CTA
- **3-5**: 스팸 트리거 단어, hard-sell, 압박
- **1-2**: 명백한 스팸

**DO NOT DEDUCT**: 파트너십 톤, 단일 Ask, P.S. 링크, 15분 요청, category 수준 capability 언급, 1인칭 업계 인사이트 공유
**ONLY DEDUCT**: 스팸 트리거 단어, hard-sell 명령형, 과도한 caps·느낌표·외부 링크, template smell, 경쟁자 비하, 반복 jargon

통과 기준: score >= 8 (도메인 평판 보호를 위해 유지).
