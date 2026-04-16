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

const SPAM_WORDS = [
  "free", "guarantee", "guaranteed", "winner", "congratulations",
  "limited time", "act now", "click here", "no cost", "risk free",
  "risk-free", "exclusive deal", "don't miss", "urgent",
  "buy now", "order now", "special promotion", "no obligation",
  "double your", "earn extra", "cash bonus",
];

function checkSpamRules(subject: string, body: string): string[] {
  const issues: string[] = [];
  const full = `${subject} ${body}`;
  const lower = full.toLowerCase();

  const found = SPAM_WORDS.filter((w) => lower.includes(w));
  if (found.length > 0) issues.push(`스팸단어 ${found.length}개: ${found.join(", ")}`);

  const spsLinks = (body.match(/spscos\.com/gi) || []).length;
  if (spsLinks >= 3) issues.push(`spscos.com 링크 ${spsLinks}개 (최대 2개)`);

  const extLinks = (body.match(/https?:\/\/(?!.*spscos\.com)[^\s)]+/gi) || []).length;
  if (extLinks >= 2) issues.push(`외부 링크 ${extLinks}개 (최대 1개)`);

  if (/\b[A-Z]{2,}(\s+[A-Z]{2,}){2,}\b/.test(body)) issues.push("대문자 단어 3개+ 연속");

  if (/!{2,}/.test(full)) issues.push("느낌표 2개+ 연속");

  return issues;
}

function autoFixSpam(body: string): { fixed: string; fixes: string[] } {
  let fixed = body;
  const fixes: string[] = [];

  for (const w of SPAM_WORDS) {
    const re = new RegExp(`\\b${w}\\b`, "gi");
    if (re.test(fixed)) {
      fixed = fixed.replace(re, "").replace(/\s{2,}/g, " ").trim();
      fixes.push(`단어제거: "${w}"`);
    }
  }

  let spsCount = 0;
  fixed = fixed.replace(/spscos\.com/gi, (m: string) => { spsCount++; return spsCount <= 2 ? m : ""; });
  if (spsCount > 2) fixes.push(`spscos링크 ${spsCount}→2개`);

  const extRe = /https?:\/\/(?!.*spscos\.com)[^\s)]+/gi;
  let extCount = 0;
  fixed = fixed.replace(extRe, (m: string) => { extCount++; return extCount <= 1 ? m : ""; });
  if (extCount > 1) fixes.push(`외부링크 ${extCount}→1개`);

  fixed = fixed.replace(/\b([A-Z]{2,}(?:\s+[A-Z]{2,}){2,})\b/g, (m: string) => {
    fixes.push("대문자연속→소문자");
    return m.toLowerCase();
  });

  if (/!{2,}/.test(fixed)) {
    fixed = fixed.replace(/!{2,}/g, "!");
    fixes.push("느낌표→1개");
  }

  fixed = fixed.replace(/\s{2,}/g, " ").trim();
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

    if (issues.length === 0) {
      // 규칙 통과 → Claude 보조 검증으로 1~10점 산출. 8+ = pass, 그 외 = flag.
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
            max_tokens: 50,
            messages: [{
              role: "user",
              content: `Rate this B2B email spam risk 1-10 (10=safe). Reply ONLY the number.\n\nSubject: ${draft.subject_line_1}\n\n${draft.body_first}`,
            }],
          }),
        });
        if (res.ok) {
          const r = await res.json();
          const s = parseInt((r.content?.[0]?.text || "").trim());
          if (!isNaN(s) && s >= 1 && s <= 10) score = s;
        }
      } catch {
        // Claude 호출 실패 시 score=10 폴백 (안전값). agentE와 동일 동작.
      }
      spamScore = score;
      spamStatus = score >= 8 ? "pass" : "flag";
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
      }
    }

    const updatePayload: Record<string, unknown> = {
      spam_status: spamStatus,
      spam_score: spamScore,
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
