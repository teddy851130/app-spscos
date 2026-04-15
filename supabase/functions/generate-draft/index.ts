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

      const companyStatus = String(intel.company_status || "");
      const kbeautyInterest = String(intel.kbeauty_interest || "");
      const recommendedFormula = Array.isArray(intel.recommended_formula)
        ? (intel.recommended_formula as string[]).join(", ")
        : String(intel.recommended_formula || "");
      const proposalAngle = String(intel.proposal_angle || "");

      const prompt = `당신은 SPS Cosmetics(spscos.com)의 CEO 신동환(Teddy Shin)이 작성하는 B2B 콜드 이메일 초안을 쓰는 카피라이터입니다.
SPS는 한국 OEM/ODM 화장품 제조사이며 MOQ는 3,000개입니다.

담당자: ${contact.contact_name} (${contact.contact_title || "직함 미상"})
회사: ${buyer.company_name} | 지역: ${buyer.region} | Tier: ${buyer.tier}
매출: ${buyer.annual_revenue || "미상"} | 직원 수: ${buyer.employee_count || "미상"}

=== 바이어 인텔 (반드시 반영) ===
기업 상태: ${companyStatus}
K-beauty 관심도: ${kbeautyInterest}
추천 포뮬러: ${recommendedFormula}
제안 각도: ${proposalAngle}
=== 인텔 끝 ===

한국어로 자연스럽고 설득력 있는 콜드 이메일 초안을 작성하세요.
반드시 바이어 인텔의 "기업 상태", "제안 각도", "추천 포뮬러"를 구체적으로 언급해야 합니다.

JSON 형식으로만 응답 (마크다운 금지):
{
  "ko_subject": "이메일 제목 (한국어, 50자 이내)",
  "ko_body": "이메일 본문 (한국어, 150~200자). 구조: 인사 → 인텔 기반 관련성 → SPS 가치 제안(추천 포뮬러 포함) → CTA → 서명(신동환, SPS Cosmetics CEO)"
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

      const prompt = `Translate the following Korean B2B cold email draft into natural, professional English.
Preserve the structure, tone, and all specific details (product categories, company references, CTAs).
The sender is Teddy Shin, CEO of SPS Cosmetics (spscos.com). MOQ is 3,000 units.

Korean Subject: ${ko_draft.subject}
Korean Body:
${ko_draft.body}

Return ONLY a JSON object (no markdown):
{
  "en_subject": "Translated English subject",
  "en_body": "Translated English body (natural, professional B2B tone)"
}`;

      const text = await callClaude(apiKey, prompt, 1000);
      const json = parseJsonFromText(text);
      if (!json || !json.en_subject || !json.en_body) {
        return new Response(
          JSON.stringify({ success: false, message: "영문 번역 파싱 실패" }),
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
