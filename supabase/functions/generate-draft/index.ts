// SPS Generate-Draft Edge Function
// 2단계 국문 → 영문 초안 생성 플로우
//
// action="generate_ko":
//   바이어 인텔 기반으로 Claude가 국문 이메일 초안(제목+본문)을 생성해 반환
//
// action="translate_save":
//   국문 초안을 영문으로 번역한 뒤 email_drafts 테이블에 INSERT

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MODEL_ID = "claude-haiku-4-5-20251001";

function getSupabase() {
  const serviceKey = Deno.env.get("SERVICE_ROLE_KEY")
    ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(Deno.env.get("SUPABASE_URL")!, serviceKey!);
}

async function callClaude(apiKey: string, prompt: string, maxTokens: number): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL_ID,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text || "";
}

function parseJsonFromText(text: string): Record<string, unknown> | null {
  // Claude가 ```json ... ``` 마크다운으로 감쌀 수 있음 — 마커 제거 후 파싱
  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    // 폴백: 첫 { ... 마지막 } 추출 시도
    try {
      const m = text.match(/\{[\s\S]*\}/);
      return m ? JSON.parse(m[0]) : null;
    } catch {
      return null;
    }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY 환경변수 없음" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json();
    const action = body.action as string;

    // ==================================================
    // action: generate_ko — 국문 초안 생성
    // ==================================================
    if (action === "generate_ko") {
      const { buyer, contact, intel } = body;
      if (!buyer || !contact || !intel) {
        return new Response(
          JSON.stringify({ error: "buyer/contact/intel 필요" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // PR13(ADR-032): P.S. 링크를 자체 redirect(/go/{token})로 교체 → 클릭 이벤트 수집.
      // 클라이언트가 tracking_token을 안 보낼 수 있으므로 서버에서 DB 조회로 보강.
      const TRACK_BASE = Deno.env.get("TRACK_BASE_URL") || "https://app-spscos.vercel.app/go";
      let trackingToken: string | null = typeof contact.tracking_token === "string" ? contact.tracking_token : null;
      if (!trackingToken && contact.id) {
        try {
          const sb = getSupabase();
          const { data: row } = await sb
            .from("buyer_contacts")
            .select("tracking_token")
            .eq("id", contact.id)
            .maybeSingle();
          trackingToken = (row?.tracking_token as string | null) ?? null;
        } catch {
          // DB 조회 실패 시 폴백 URL 사용 — 초안 생성은 막지 않음
        }
      }
      const trackingUrl = trackingToken ? `${TRACK_BASE}/${trackingToken}` : "https://spscos.com/";

      const companyStatus = String(intel.company_status || "");
      const kbeautyInterest = String(intel.kbeauty_interest || "");
      const recommendedFormula = Array.isArray(intel.recommended_formula)
        ? (intel.recommended_formula as string[]).join(", ")
        : String(intel.recommended_formula || "");
      const proposalAngle = String(intel.proposal_angle || "");

      // ADR-024: v3 프롬프트 — "CIA + Challenger Sale" 프레임워크.
      //   Jason Bay CIA (Context-Insight-Ask) + Challenger Sale의 Teach-Tailor-Take control 톤.
      //   - Context: 바이어 회사 구체 고유명사 2개 이상 인용 의무 (연구한 티)
      //   - Insight: 업계 패턴/관점 제공 후 바이어 상황에 맞춤 (단순 자사 소개가 아님)
      //   - Ask: 단일·저부담·타이밍 개방형 + P.S. 3분 미리보기 링크(클릭 → CRM)
      //   - 세일즈 클리셰 15개 + 감시형 표현 + 구체 숫자 + 객관식 질문 모두 금지
      const prompt = `당신은 SPS Cosmetics(spscos.com) CEO 신동환(Teddy Shin) 명의 B2B 콜드 이메일 초안을 쓰는 카피라이터입니다.

SPS 강점 — 본문에서 묘사할 때 구체 숫자(MOQ·납기·퍼센트) 절대 금지:
- 빠른 진행과 회신 — 빠른 견적·샘플링, CEO 직접 응답
- 모든 화장품 카테고리(스킨케어·바디케어·컬러·헤어케어·프래그런스)를 커버하는 제조 파트너 네트워크
- 다국가 수출 경험 (GCC·미국·유럽 등)
- 완전 맞춤형 풀턴키 — 가격·수량·퀄리티·디자인을 귀사 기준으로 설계
- 포뮬레이션·패키징·규제·물류 단일 파트너로 엔드투엔드

담당자: ${contact.contact_name} (${contact.contact_title || "직함 미상"})
회사: ${buyer.company_name} | 지역: ${buyer.region} | Tier: ${buyer.tier}
매출: ${buyer.annual_revenue || "미상"} | 직원 수: ${buyer.employee_count || "미상"}

=== 바이어 인텔 (Context 구간에서 구체 고유명사를 이곳에서 인용) ===
기업 상태: ${companyStatus}
K-beauty 관심도: ${kbeautyInterest}
추천 카테고리(내부용, body_followup에서 카테고리 수준만 언급 가능): ${recommendedFormula}
제안 각도: ${proposalAngle}
=== 인텔 끝 ===

프레임워크: CIA (Context - Insight - Ask). 톤은 "Warm-Confident" — 자신감은 있되 한국어 비즈니스 정서에 맞게 **부드럽고 친절하게**. 영어식 직접 단언("~ 못합니다", "정확히 그 지점") 직역 금지 — 한국어로 직역되면 우월·도발적 인상.

(0) 인사말 (필수 첫 줄) — "안녕하세요, ${contact.contact_name} 님." 또는 "${contact.contact_name} 님께," 로 시작. 바로 본문으로 들어가지 말 것.

(1) CONTEXT — 인사말 다음 1~2문장. 반드시 "기업 상태" 또는 "제안 각도"에서 **구체 고유명사 2개 이상**(제품·브랜드·도시·파트너·최근 론칭·캠페인 등)을 인용해 "귀사 소식을 관심 있게 지켜보고 있다"를 증명. 중립·존중형. 좋은 시작 어구: "최근 ${buyer.company_name}의 ~ 소식을 관심 있게 보았습니다", "~ 론칭 기사를 인상 깊게 읽었습니다", "~ 확장 방향이 흥미로워 연락드립니다". 감시형 표현은 **절대 금지**: "관찰됩니다", "~인 것으로 보입니다", "저희가 분석한 바에 따르면", "~로 파악됩니다".

(2) INSIGHT — 2~3문장. 업계 패턴 하나를 **조심스럽게 공유**하는 톤. "유사한 ${buyer.region} 브랜드들이 X 단계에서 Y 단계로 가실 때, 저희가 자주 보게 되는 부분은 [일반적 요소]보다 [덜 알려진 구체 요소]인 것 같습니다" 형태. 경쟁자 비하 금지 — "대부분의 제조사는 못 합니다" 대신 **"많은 제조사들이 이 부분에서 함께 고민하시는 걸 자주 보았습니다"** 식 객관화·공감형. 업계 동료로서 인사이트를 나누는 느낌.

(3) TRANSITION TO SPS — 1~2문장. 자신감 있되 **겸손한 제안형**. "SPS는 정확히 그 지점을 위해 만들었습니다" 같은 단정 표현 금지 → **"SPS가 바로 이런 맥락에서 도움이 될 수 있지 않을까 하는 생각이 들어 말씀드립니다"** 또는 **"SPS는 이 부분을 기능의 중심에 두고 있어, 작은 도움이라도 드릴 수 있을 것 같습니다"** 식. 카테고리 수준으로만 역량 묘사. 구체 제품명·숫자 금지.

(4) ASK — 1문장. 단일·저부담·타이밍 개방형. 예: "${buyer.company_name}의 다음 단계에 저희가 조금이라도 도움이 될 수 있을지, 편하신 때에 15분만 시간 내주실 수 있다면 감사하겠습니다." 객관식·복수 질문 금지. 명령조("~ 하세요") 금지.

(5) 서명 — "Teddy 드림" 한 줄만. (콜드 1차 메일에서는 first-name + 드림 이 가장 친근·예의 균형.)

(6) 추신 (필수) — 한 줄. "추신. 3분짜리 미리보기: ${trackingUrl}" 정확히 이 형식 (URL은 있는 그대로 복사 — spscos.com으로 교체 금지). 링크는 클릭 추적 신호 용도. 홍보성 수식어 금지.

톤 체크리스트 (최종 검토):
- 단정형("~입니다", "~ 확신합니다") 최소화. 제안형("~인 것 같습니다", "~ 생각됩니다", "~일 수 있지 않을까 싶습니다") 위주.
- "~ 주실 수 있다면 감사하겠습니다", "~ 하시는 건 어떠실까요" 같은 완충 표현 활용.
- 경쟁자(다른 OEM/제조사) 직접 비하 금지. "많은 제조사들이 ~ 고민하시는 걸 보았습니다" 같은 공감·객관 표현으로 우회.
- "~ 겪지 않으셨으면 합니다" 같이 상대 걱정해주는 척하는 우월 뉘앙스 금지 → "~에 조금이라도 힘이 될 수 있다면 기쁜 마음으로 함께하겠습니다" 식 동료적 제안.

엄격한 제약 — 위반 시 초안 불합격:
- 본문에 반드시 ${buyer.company_name} 인텔에서 뽑은 **구체 고유명사 2개 이상**. "귀사", "귀 브랜드", "귀 지역" 같은 일반 표현만으로는 템플릿 냄새 → 실패.
- 본문에 SPS 구체 제품명·SKU·포뮬러명 금지. 구체 숫자(MOQ·납기 주수·퍼센트·가격 범위) 금지. 객관식 질문 "(a)/(b)/(c)" 금지. 불릿 4개 초과 금지.
- You-to-Me 비율: "귀사/${buyer.company_name}" 표현이 "저희/SPS"보다 **5배 이상** 자주 등장. 문장 주어를 앞쪽에 '귀사'로 배치.
- 톤: 동료 간 대화, 따뜻하지만 직설적, 업계 내부자. 홍보 톤·감시 톤 금지.
- **금지 세일즈 클리셰** (동의어·번역형 포함 전면 금지): unlock/언락, synergy/시너지 극대화, leverage/레버리지, game-changer/게임 체인저, best-in-class/동급 최강, world-class/세계 최고, industry-leading/업계 최고, state-of-the-art/최첨단, cutting-edge/최첨단, revolutionary/혁신적인, next-level/차원이 다른, take your ~ to the next level/한 차원 높이다, positioned to/~할 준비가 된, touch base, circle back, just wanted to, amazing/놀라운, ultimate/완벽한, 최고의.
- **금지 스팸 트리거** (35개, 영어·한국어 모두): free/무료, guarantee·guaranteed/보장, winner/당첨, congratulations/축하, limited time/한정 시간, act now/지금 행동, click here/여기 클릭, no cost/비용 없음, risk free·risk-free/위험 없음, exclusive deal/독점 제안, don't miss/놓치지 마세요, urgent/긴급, buy now/지금 구매, order now/지금 주문, special promotion/특별 프로모션, no obligation/의무 없음, double your/두 배로, earn extra/추가 수익, cash bonus/현금 보너스, amazing/놀라운, ultimate/최고의, incredible/믿기 어려운, unbeatable/비할 데 없는, hurry/서두르세요, deadline/마감, last chance/마지막 기회, today only/오늘만, discount/할인, lowest price/최저가, best price/최고가, don't wait/기다리지 마세요, while supplies last/재고 소진 시까지, one-time offer/일회성 제안.
- 링크: 추신에 위에서 지정한 ${trackingUrl} 링크 **정확히 1개**. 본문에 링크 금지. 다른 외부 링크 금지. 느낌표 연속 금지. 대문자 단어 3개 이상 연속 금지.

JSON 형식으로만 응답 (마크다운 금지):
{
  "ko_subject": "제목 (한국어, 3~12자 추천, ${buyer.company_name}의 구체 사실 1개 + 가벼운 관찰 훅. 예: '${buyer.company_name}의 ~ 소식에 대해 짧은 생각')",
  "ko_body": "본문 (한국어, 길이 제한 없음 — 300~500자 권장). CIA + Challenger 5파트 구조: (1) Context에 구체 고유명사 2개 이상, (2) Insight로 업계 패턴 + ${buyer.company_name} 맞춤, (3) SPS 카테고리 수준 역량으로 전환, (4) 단일 저부담 Ask, (5) 'Teddy' 서명 단독 줄, (6) '추신. 3분짜리 미리보기: ${trackingUrl}' — URL은 정확히 복사 (spscos.com으로 치환 금지)."
}`;

      const text = await callClaude(apiKey, prompt, 800);
      const json = parseJsonFromText(text);
      if (!json || !json.ko_subject || !json.ko_body) {
        return new Response(
          JSON.stringify({ error: "Claude 응답 파싱 실패", raw: text.slice(0, 300) }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          ko_subject: json.ko_subject,
          ko_body: json.ko_body,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ==================================================
    // action: translate_save — 영문 번역 후 email_drafts 저장
    // ==================================================
    if (action === "translate_save") {
      const { buyer, contact, ko_draft } = body;
      // PR6: 사용자가 의도적으로 pass 상태 초안을 덮어쓰려 할 때 가드 우회용 플래그.
      //   false/미지정이면 기존과 동일하게 409 DRAFT_PASS_EXISTS 반환.
      const force = body.force === true;
      if (!buyer || !contact || !ko_draft?.subject || !ko_draft?.body) {
        return new Response(
          JSON.stringify({ error: "buyer/contact/ko_draft 필요" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // buyer_id는 email_drafts.buyer_id NOT NULL 제약 때문에 필수
      if (!buyer.id) {
        return new Response(
          JSON.stringify({ error: "buyer.id 필요 (email_drafts.buyer_id NOT NULL)" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // PR6.6: 내용 보존은 엄격, 스타일은 세련되게 — 두 축을 분리. 사용자(Teddy)는 한국어로
      //   비즈니스 톤 작성 후 Claude가 polished English로 다듬어주길 원함. 단 의도한 문장의
      //   임의 삭제·재구성은 금지 (PR6.5의 "미워합니다" 누락 사건 방지).
      const prompt = `You are a professional B2B email translator (Korean → English) for a non-native English speaker.
Your job has TWO axes — keep them separate:

AXIS 1 — CONTENT PRESERVATION (strict):
- Translate EVERY sentence, clause, and claim. Do NOT drop, merge, or skip any source sentence based on your own judgment about "appropriateness" or "context fit."
- If the user wrote it, translate it. Every specific detail (product categories, numbers, company references, CTAs, unusual statements) must survive into the output.

AXIS 2 — STYLE POLISH (encouraged):
- The user is not a native English speaker. Elevate the phrasing into polished, natural B2B business English — use professional vocabulary, idiomatic business expressions, and proper email conventions.
- Feel free to improve word choice, sentence flow, and tone for naturalness, AS LONG AS every source sentence's meaning is fully preserved.
- Preserve paragraph breaks and signature structure.

Context: Sender is Teddy Shin, CEO of SPS Cosmetics (spscos.com). MOQ is 3,000 units.

Korean Subject: ${ko_draft.subject}
Korean Body:
${ko_draft.body}

Return ONLY a JSON object (no markdown):
{
  "en_subject": "Polished English subject",
  "en_body": "Polished English body — every Korean sentence translated, styled into natural B2B business English"
}`;

      // ADR-026: 한글 혼입 가드. translate_save는 사용자 수동 경로라 한글 잔류 시 바로 UI에
      //   표시됨 → 영문/국문 혼재 사용자 경험 악화. run-pipeline agentD는 이미 가드 있지만
      //   (recent_news 기반 자동 경로), translate_save에는 없었음. Claude가 비영어 전환을
      //   누락하는 경우를 감지해 한 번 재번역 → 여전히 한글 남으면 502 반환.
      const nonLatinRe = /[\u3131-\uD79D\u4E00-\u9FFF\uAC00-\uD7AF]/;
      async function translateWithGuard(): Promise<Record<string, unknown> | null> {
        const text1 = await callClaude(apiKey, prompt, 1000);
        const json1 = parseJsonFromText(text1);
        if (!json1 || !json1.en_subject || !json1.en_body) return null;
        const subj = String(json1.en_subject);
        const body = String(json1.en_body);
        if (!nonLatinRe.test(subj) && !nonLatinRe.test(body)) return json1;
        // 한글·한자 잔류 감지 → 재번역 1회 (강화된 지시)
        const retryPrompt = prompt + `

STRICT RETRY — the previous attempt contained non-English characters. Output MUST contain zero Korean Hangul, zero Hanja, zero non-Latin scripts in en_subject and en_body. Proper nouns like brand or city names are acceptable ONLY in their standard English romanization.`;
        const text2 = await callClaude(apiKey, retryPrompt, 1000);
        const json2 = parseJsonFromText(text2);
        if (!json2 || !json2.en_subject || !json2.en_body) return json1;
        const subj2 = String(json2.en_subject);
        const body2 = String(json2.en_body);
        if (!nonLatinRe.test(subj2) && !nonLatinRe.test(body2)) return json2;
        return null; // 재번역에도 한글 남음 → 명시적 실패
      }

      const json = await translateWithGuard();
      if (!json || !json.en_subject || !json.en_body) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "영문 번역 파싱 실패 또는 한글 잔류 감지 — 국문 본문에 번역 불가 문자가 포함됐을 수 있습니다. 국문을 조정 후 재시도하세요.",
            code: "TRANSLATION_KOREAN_RESIDUAL",
          }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // email_drafts 저장 — 미발송 초안 UNIQUE(buyer_contact_id) WHERE is_sent=false 제약 존중.
      // 부분 UNIQUE 인덱스는 PostgREST ON CONFLICT 추론이 불안정하므로 명시적으로
      // 조회 → UPDATE/INSERT 분기. 같은 컨택트에 미발송 초안이 있으면 본문을 덮어쓴다.
      //
      // 덮어쓰기 가드: 직원 E가 'pass'로 검증 완료한 초안(발송 준비 완료)은 덮어쓰지 않는다.
      //   사용자가 MailQueue에서 공들여 다듬은 뒤 저장한 결과를 BuyerIntelDrawer 재클릭으로 날리지 않기 위함.
      //   덮어쓰기를 원하면 먼저 해당 초안을 삭제하거나 발송해야 함.
      const sb = getSupabase();
      const { data: existing } = await sb
        .from("email_drafts")
        .select("id, spam_status")
        .eq("buyer_contact_id", contact.id)
        .eq("is_sent", false)
        .maybeSingle();

      let inserted: { id: string } | null = null;
      if (existing?.id) {
        if (existing.spam_status === "pass") {
          if (!force) {
            return new Response(
              JSON.stringify({
                success: false,
                message: "이미 검증 완료된(pass) 미발송 초안이 있습니다. 기존 초안을 먼저 발송하거나 삭제하세요.",
                code: "DRAFT_PASS_EXISTS",
                draft_id: existing.id,
              }),
              { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          console.log(`[generate-draft] force=true: pass 초안 덮어쓰기 (buyer_id=${buyer.id}, contact_id=${contact.id}, draft_id=${existing.id})`);
        }
        const { data: updated, error: updErr } = await sb
          .from("email_drafts")
          .update({
            buyer_id: buyer.id,
            subject_line_1: json.en_subject,
            subject_line_2: "",
            subject_line_3: "",
            body_first: json.en_body,
            body_followup: "",
            tier: buyer.tier,
            // 본문이 바뀌었으므로 스팸 검사 결과는 무효화 → 직원 E가 재검증하게 함
            spam_score: null,
            spam_status: null,
          })
          .eq("id", existing.id)
          .select("id")
          .single();
        if (updErr) {
          return new Response(
            JSON.stringify({ success: false, message: `DB UPDATE 실패: ${updErr.message}` }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        inserted = updated;
      } else {
        // INSERT 경로 — 동시 호출 TOCTOU로 UNIQUE 위반이 발생하면 UPDATE로 폴백.
        // Postgres UNIQUE 위반 SQLSTATE는 '23505'. PostgREST는 이를 code 필드에 전달.
        const { data: created, error: insErr } = await sb
          .from("email_drafts")
          .insert({
            buyer_id: buyer.id,
            buyer_contact_id: contact.id,
            subject_line_1: json.en_subject,
            subject_line_2: "",
            subject_line_3: "",
            body_first: json.en_body,
            body_followup: "",
            tier: buyer.tier,
            is_sent: false,
          })
          .select("id")
          .single();

        if (insErr) {
          const code = (insErr as { code?: string }).code;
          if (code === "23505") {
            // 동시 호출로 다른 요청이 먼저 초안을 INSERT함 → UPDATE 폴백
            const { data: existingAfter } = await sb
              .from("email_drafts")
              .select("id, spam_status")
              .eq("buyer_contact_id", contact.id)
              .eq("is_sent", false)
              .maybeSingle();
            if (!existingAfter?.id) {
              return new Response(
                JSON.stringify({ success: false, message: "UNIQUE 위반 후 재조회 실패" }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
            if (existingAfter.spam_status === "pass") {
              if (!force) {
                return new Response(
                  JSON.stringify({
                    success: false,
                    message: "동시에 검증 완료된 초안이 생성되었습니다. 기존 초안을 먼저 처리하세요.",
                    code: "DRAFT_PASS_EXISTS",
                    draft_id: existingAfter.id,
                  }),
                  { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
              }
              console.log(`[generate-draft] force=true: TOCTOU 경합 후 pass 초안 덮어쓰기 (buyer_id=${buyer.id}, contact_id=${contact.id}, draft_id=${existingAfter.id})`);
            }
            const { data: updated, error: updErr2 } = await sb
              .from("email_drafts")
              .update({
                buyer_id: buyer.id,
                subject_line_1: json.en_subject,
                subject_line_2: "",
                subject_line_3: "",
                body_first: json.en_body,
                body_followup: "",
                tier: buyer.tier,
                spam_score: null,
                spam_status: null,
              })
              .eq("id", existingAfter.id)
              .select("id")
              .single();
            if (updErr2) {
              return new Response(
                JSON.stringify({ success: false, message: `UNIQUE 위반 후 UPDATE 실패: ${updErr2.message}` }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
            inserted = updated;
          } else {
            return new Response(
              JSON.stringify({ success: false, message: `DB INSERT 실패: ${insErr.message}` }),
              { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        } else {
          inserted = created;
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          draft_id: inserted?.id,
          en_subject: json.en_subject,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ==================================================
    // action: translate_only — 국문 → 영문 번역만 수행 (DB 저장 없음)
    // ==================================================
    if (action === "translate_only") {
      const { ko_subject, ko_body } = body;
      if (!ko_subject || !ko_body) {
        return new Response(
          JSON.stringify({ error: "ko_subject/ko_body 필요" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const prompt = `Translate the following Korean B2B cold email into natural, professional English.
Preserve the business tone, all specific details (product categories, company references, CTAs),
numerical facts (MOQ, timelines, pricing), and sign-off structure.
Do not add or remove information — translate faithfully.
The sender is Teddy Shin, CEO of SPS Cosmetics (spscos.com). MOQ is 3,000 units.

Korean Subject:
${ko_subject}

Korean Body:
${ko_body}

Return ONLY a JSON object (no markdown, no code fences):
{
  "en_subject": "Translated English subject (concise, professional)",
  "en_body": "Translated English body — natural professional B2B tone, preserve paragraph structure and sign-off"
}`;

      const text = await callClaude(apiKey, prompt, 1500);
      const json = parseJsonFromText(text);
      if (!json || !json.en_subject || !json.en_body) {
        return new Response(
          JSON.stringify({ error: "번역 응답 파싱 실패", raw: text.slice(0, 300) }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          en_subject: json.en_subject,
          en_body: json.en_body,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
