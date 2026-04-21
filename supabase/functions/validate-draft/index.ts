// SPS Validate-Draft Edge Function (PR6.3)
// 단일 email_drafts 행에 대해 스팸 검증을 즉시 실행.
// 사용자가 EmailComposeModal에서 "저장 및 재검증" 눌렀을 때 호출 → 다음 파이프라인까지 기다리지 않고 바로 발송 가능 상태로.
//
// 입력: { draft_id: string }
// 출력: { success, spam_status: 'pass'|'rewrite'|'flag', spam_score, fixes?: string[], body_first?: string }
//
// TODO(PR7): agent-e 본격 분리 시 SPAM_WORDS/checkSpamRules/autoFixSpam을 공용 모듈로 추출 →
//   현재는 run-pipeline/index.ts의 agentE 헬퍼를 복사하여 중복 존재. 로직 변경 시 두 곳 동기화 필요.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL_ID = "claude-haiku-4-5-20251001";

function getSupabase() {
  const serviceKey = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(Deno.env.get("SUPABASE_URL")!, serviceKey!);
}

// === run-pipeline/index.ts agentE에서 복사 (TODO: PR7에서 공용 모듈화) ===

// ADR-030: 35개 (3곳 동기화 필수: run-pipeline · validate-draft · MailQueue.tsx)
// ADR-043 (2026-04-21, PR17): 실측 스팸 메일 역추적으로 15개 추가 (35→50).
// ADR-043 수정: PR17 신규 15개 중 autoFixSpam에서 통째 제거 시 문장 문법이
// 깨지는 "정상 콜드메일 표현"은 제외. 진짜 corporate 자갈/template smell만 유지.
// 제외된 것(정상 표현): "multi-market", "rapid response capability",
// "next phase of expansion", "i would be grateful", "consistently notice",
// "manufacturing flexibility", "long-term partnerships", "customer expectations",
// "grown alongside", "export experience", "brief conversation"
// → 이들은 Claude 평가 rubric에서 "template smell" 로 관찰, autoFix 대상 아님
const SPAM_WORDS = [
  "free", "guarantee", "guaranteed", "winner", "congratulations",
  "limited time", "act now", "click here", "no cost", "risk free",
  "risk-free", "exclusive deal", "don't miss", "urgent",
  "buy now", "order now", "special promotion", "no obligation",
  "double your", "earn extra", "cash bonus",
  "amazing", "ultimate", "incredible", "unbeatable",
  "hurry", "deadline", "last chance", "today only",
  "discount", "lowest price", "best price",
  "don't wait", "while supplies last", "one-time offer",
  // ADR-043 유지 (실측 스팸 메일 공통 corporate 자갈/template smell)
  "leveraging",
  "premium beauty brands across all categories",
  "fully customized manufacturing partner",
  "formulation excellence",
];

// PR13(ADR-032): SPS 도메인 = spscos.com + app.spscos.com/go (tracking redirect) 합산
// legacy 호환: app-spscos.vercel.app/go도 인식 (구 fallback URL, 과거 발송분)
const SPS_DOMAIN_RE = /(?:spscos\.com|app-spscos\.vercel\.app\/go)/gi;
const EXTERNAL_LINK_RE = /https?:\/\/(?!(?:[^\s]*spscos\.com)|(?:[^\s]*app-spscos\.vercel\.app\/go))[^\s)]+/gi;

function checkSpamRules(subject: string, body: string): string[] {
  const issues: string[] = [];
  const full = `${subject} ${body}`;
  const lower = full.toLowerCase();

  const found = SPAM_WORDS.filter((w) => lower.includes(w));
  if (found.length > 0) issues.push(`스팸단어 ${found.length}개: ${found.join(", ")}`);

  // PR17.1 5줄 서명(teddy@spscos.com + Web: spscos.com) + MID-BODY tracking URL(app.spscos.com/go)
  // = 정상 draft 1건에 3개 매칭이 기본. 임계값을 4 이상으로 완화해 서명이 autoFix에 잘리지 않도록.
  const spsLinks = (body.match(SPS_DOMAIN_RE) || []).length;
  if (spsLinks >= 4) issues.push(`SPS 도메인 링크 ${spsLinks}개 (최대 3개)`);

  const extLinks = (body.match(EXTERNAL_LINK_RE) || []).length;
  if (extLinks >= 2) issues.push(`외부 링크 ${extLinks}개 (최대 1개)`);

  if (/\b[A-Z]{2,}(\s+[A-Z]{2,}){2,}\b/.test(body)) issues.push("대문자 단어 3개+ 연속");

  if (/!{2,}/.test(full)) issues.push("느낌표 2개+ 연속");

  // ADR-043 (PR17): 한국 정체성 키워드 누락 → Korean OEM 신호 부재 = 스팸 취급 위험
  const koreaPattern = /\b(korea|korean|k-?beauty|made in korea)\b/i;
  if (!koreaPattern.test(body)) {
    issues.push("한국 정체성 키워드 누락 (Korea / Korean / K-Beauty / Made in Korea 중 1개 필요)");
  }

  // ADR-043 (PR17): 본문 180단어 초과 flag.
  //   전체 180 = 메시지 본문 ~120~150 + 5줄 풀 서명 블록 ~30. 실측 스팸 평균 230+ 대비 여전히 짧음.
  const wordCount = body.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount > 180) {
    issues.push(`본문 ${wordCount}단어 (최대 180, 서명 블록 포함)`);
  }

  return issues;
}

function autoFixSpam(body: string): { fixed: string; fixes: string[] } {
  let fixed = body;
  const fixes: string[] = [];

  for (const w of SPAM_WORDS) {
    const re = new RegExp(`\\b${w}\\b`, "gi");
    if (re.test(fixed)) {
      // PR6.7: \s{2,}는 줄바꿈까지 포함해 문단 구조를 파괴. [ \t]{2,}로 같은 줄 내 공백만 압축.
      fixed = fixed.replace(re, "").replace(/[ \t]{2,}/g, " ");
      fixes.push(`단어제거: "${w}"`);
    }
  }

  // PR17.1 서명 기본 3개 매칭 고려 — autoFix는 4번째부터 제거.
  let spsCount = 0;
  fixed = fixed.replace(SPS_DOMAIN_RE, (m: string) => { spsCount++; return spsCount <= 3 ? m : ""; });
  if (spsCount > 3) fixes.push(`SPS링크 ${spsCount}→3개`);

  let extCount = 0;
  fixed = fixed.replace(EXTERNAL_LINK_RE, (m: string) => { extCount++; return extCount <= 1 ? m : ""; });
  if (extCount > 1) fixes.push(`외부링크 ${extCount}→1개`);

  fixed = fixed.replace(/\b([A-Z]{2,}(?:\s+[A-Z]{2,}){2,})\b/g, (m: string) => {
    fixes.push("대문자연속→소문자");
    return m.toLowerCase();
  });

  if (/!{2,}/.test(fixed)) {
    fixed = fixed.replace(/!{2,}/g, "!");
    fixes.push("느낌표→1개");
  }

  // PR6.7: 마지막 정리도 줄바꿈 보존. [ \t]만 압축, 양끝 공백만 trim.
  fixed = fixed.replace(/[ \t]{2,}/g, " ").trim();
  return { fixed, fixes };
}

// === 핸들러 ===

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
    const draftId = body.draft_id as string | undefined;
    if (!draftId) {
      return new Response(
        JSON.stringify({ error: "draft_id 필요" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sb = getSupabase();
    const { data: draft, error: fetchErr } = await sb
      .from("email_drafts")
      .select("id, subject_line_1, body_first")
      .eq("id", draftId)
      .maybeSingle();

    if (fetchErr || !draft) {
      return new Response(
        JSON.stringify({ error: fetchErr?.message || "draft 조회 실패" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const issues = checkSpamRules(draft.subject_line_1 as string, draft.body_first as string);
    let spamStatus: "pass" | "rewrite" | "flag" = "flag";
    let spamScore: number | null = null;
    let fixes: string[] = [];
    let finalBody = draft.body_first as string;
    // PR6.5: flag 원인 노출용. Claude가 8점 미만 평가할 때의 한국어 이유. 프론트 alert에 표시.
    let claudeReason: string | null = null;
    // PR6.5: 규칙 검사 이후 flag가 된 최종 원인 규칙. 초기 issues는 자동수정 대상일 수 있어 따로 보관.
    let flagIssues: string[] = [];

    if (issues.length === 0) {
      // 규칙 통과 → Claude 보조 검증으로 1~10점 + 이유 산출. 8+ = pass, 그 외 = flag.
      let score = 10;
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: MODEL_ID,
            max_tokens: 200,
            // 2026-04-22 비결정성 차단: temperature 기본값 1.0 이라 같은 본문에 호출마다 6/7/8점 변동 발생.
            // 0.2 로 고정해 동일 본문 재평가 시 같은 점수 수렴.
            temperature: 0.2,
            messages: [{
              role: "user",
              // ADR-025 + 2026-04-22 루브릭 강화: 7점 이하는 구체 증거 2개 이상 인용 필수.
              content: `You are evaluating a B2B cold email sent by a Korean cosmetic OEM/ODM manufacturer to a beauty brand buyer. Your job: score the email on whether it would (a) pass Gmail/Outlook spam filters and (b) feel authentic to the recipient. The baseline for a competent, personalized B2B cold email is 8-10. Only deduct below 8 if you find SPECIFIC concrete issues.

IMPORTANT — EVIDENCE REQUIREMENT (2026-04-22):
- Any score of 7 or below MUST be justified by quoting at least TWO specific problematic phrases from the email body. Vague reasons like "template smell" or "lacks personalization" without quoted evidence are NOT acceptable.
- If you cannot identify TWO concrete spam triggers or specific generic phrases, default to 8.

SCORING RUBRIC:
- 10: natural, personalized, peer-to-peer, zero red flags
- 8-9: solid B2B cold email, maybe one minor polish point but no real risk (DEFAULT for translated emails with basic personalization)
- 6-7: noticeable issue — must quote 2+ specific problematic phrases (template smell, hype adjectives, overused sales jargon, pushy CTA)
- 3-5: multiple issues — spam trigger words, excessive links/caps, hard-sell language, pressure tactics
- 1-2: obvious spam / will land in spam folder

DO NOT DEDUCT for:
- Confident partnership tone, single soft CTA, single link in P.S. or mid-body
- Mentioning the sender company's capabilities at category level
- Asking for a 15-minute conversation politely
- Industry-insight sharing written in first person
- Translation artifacts ("we consistently observe", "we believe", "I have observed") — these are normal in professional B2B English
- Recipient personalization that mentions company but not specific role (title reference is a nice-to-have, not required)
- Length of signature block (5-line signature with address/phone is standard for Korean business context)

ONLY DEDUCT for:
- Actual spam trigger words (free/guarantee/winner/urgent/click here/limited time etc.)
- Hard-sell imperatives ("buy now", "act today", "don't miss out")
- Excessive caps, repeated exclamation marks, multiple external links
- Generic template with zero specific personalization (no company name mentioned, no specific product/event reference)
- Competitor bashing ("unlike other manufacturers", "most OEMs fail at")
- Over-repetition of sales jargon (partner/synergy/bespoke/turnkey repeated 4+ times)

Reply ONLY as a JSON object (no markdown): {"score": <integer 1-10>, "reason": "<if score >= 8, empty string. If score <= 7, ONE short Korean sentence that QUOTES 2+ specific problematic phrases from the email body>"}

Subject: ${draft.subject_line_1}

${draft.body_first}`,
            }],
          }),
        });
        if (res.ok) {
          const r = await res.json();
          const txt = (r.content?.[0]?.text || "").trim();
          // JSON 파싱 시도. 실패 시 숫자만 있는 경우 폴백.
          try {
            const m = txt.match(/\{[\s\S]*\}/);
            const parsed = JSON.parse(m ? m[0] : txt);
            if (typeof parsed.score === "number" && parsed.score >= 1 && parsed.score <= 10) {
              score = parsed.score;
            }
            if (typeof parsed.reason === "string" && parsed.reason.trim()) {
              claudeReason = parsed.reason.trim();
            }
          } catch {
            const s = parseInt(txt);
            if (!isNaN(s) && s >= 1 && s <= 10) score = s;
          }
        }
      } catch {
        // Claude 호출 실패 시 score=10 폴백 (안전값). agentE와 동일 동작.
      }
      spamScore = score;
      spamStatus = score >= 8 ? "pass" : "flag";
      if (spamStatus === "flag") {
        // Claude가 규칙 외 이유로 flag를 준 경우 — flagIssues는 비어 있고 claudeReason만 존재
      }
    } else {
      // 규칙 위반 → 자동 수정 후 재검사 (최대 1회). 수정본이 통과하면 rewrite, 실패면 flag.
      const fix = autoFixSpam(draft.body_first as string);
      const retryIssues = checkSpamRules(draft.subject_line_1 as string, fix.fixed);
      if (retryIssues.length === 0) {
        spamStatus = "rewrite";
        spamScore = 8;
        fixes = fix.fixes;
        finalBody = fix.fixed;
      } else {
        spamStatus = "flag";
        spamScore = null;
        flagIssues = retryIssues; // 자동수정 후에도 남은 규칙 위반 목록
      }
    }

    // PR14(ADR-033): flag 사유를 spam_reason에 저장. pass/rewrite 시 기존 사유 초기화.
    let reasonText: string | null = null;
    if (spamStatus === "flag") {
      if (flagIssues.length > 0) reasonText = flagIssues.join("; ").slice(0, 500);
      else if (claudeReason) reasonText = claudeReason.slice(0, 500);
    }

    const updatePayload: Record<string, unknown> = {
      spam_status: spamStatus,
      spam_score: spamScore,
      spam_reason: reasonText,
    };
    if (spamStatus === "rewrite") updatePayload.body_first = finalBody;

    const { error: updErr } = await sb
      .from("email_drafts")
      .update(updatePayload)
      .eq("id", draftId);

    if (updErr) {
      return new Response(
        JSON.stringify({ error: `DB UPDATE 실패: ${updErr.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[validate-draft] draft_id=${draftId} → ${spamStatus}${spamScore !== null ? ` (score=${spamScore})` : ""}${fixes.length ? ` fixes=[${fixes.join(", ")}]` : ""}`);

    return new Response(
      JSON.stringify({
        success: true,
        spam_status: spamStatus,
        spam_score: spamScore,
        fixes,
        body_first: spamStatus === "rewrite" ? finalBody : null,
        // PR6.5: flag 원인 노출. issues는 자동수정 후에도 남은 규칙 위반, reason은 Claude의 한국어 이유.
        issues: flagIssues,
        reason: claudeReason,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
