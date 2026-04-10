// SPS Pipeline Edge Function v2
// 직원 B→C→D→E→F 순차 실행 (백그라운드)
// 바이어 발굴(구 직원 A)은 CSV 업로드로 대체됨
// 브라우저를 닫아도 Supabase에서 독립적으로 실행됨

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type SB = ReturnType<typeof createClient>;

function getSupabase(): SB {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

// ============================================
// 로그 기록 헬퍼
// ============================================
async function log(
  sb: SB, jobId: string, agent: string, status: string,
  message: string, creditsUsed = 0, apiCostUsd = 0
) {
  await sb.from("pipeline_logs").insert({
    job_id: jobId, agent, status, message,
    credits_used: creditsUsed, api_cost_usd: apiCostUsd,
  });
}

// ============================================
// 직원 B: ZeroBounce — 이메일 유효성 검증
// ============================================
async function agentB(sb: SB, jobId: string, _team: string) {
  await log(sb, jobId, "B", "running", "직원B 시작: 이메일 유효성 검증");

  const ZB_KEY = Deno.env.get("ZEROBOUNCE_API_KEY");
  if (!ZB_KEY) { await log(sb, jobId, "B", "failed", "ZEROBOUNCE_API_KEY 없음"); return; }

  const { data: contacts } = await sb.from("buyer_contacts")
    .select("id, contact_email, buyer_id")
    .is("email_status", null)
    .not("contact_email", "is", null)
    .not("contact_email", "eq", "");

  if (!contacts || contacts.length === 0) {
    await log(sb, jobId, "B", "completed", "검증할 이메일 없음");
    return;
  }

  // buyer_id → tier 매핑
  const buyerIds = [...new Set(contacts.map((c: { buyer_id: string }) => c.buyer_id))];
  const { data: buyers } = await sb.from("buyers").select("id, tier").in("id", buyerIds);
  const tierMap = new Map((buyers || []).map((b: { id: string; tier: string }) => [b.id, b.tier]));

  let valid = 0, invalid = 0, catchAllPass = 0, catchAllFail = 0, risky = 0;

  for (const c of contacts) {
    try {
      const res = await fetch(
        `https://api.zerobounce.net/v2/validate?api_key=${ZB_KEY}&email=${encodeURIComponent(c.contact_email)}`
      );
      if (!res.ok) continue;

      const r = await res.json();
      const zbStatus = String(r.status || "").toLowerCase();
      const tier = tierMap.get(c.buyer_id) || "Tier2";
      let emailStatus: string;
      let blacklist = false;

      if (zbStatus === "valid") {
        emailStatus = "valid";
        valid++;
      } else if (zbStatus === "invalid" || zbStatus === "hard_bounce") {
        emailStatus = "invalid";
        blacklist = true;
        invalid++;
      } else if (zbStatus === "catch-all" || zbStatus === "catch_all") {
        if (tier === "Tier1") {
          emailStatus = "catch-all-pass";
          catchAllPass++;
        } else {
          emailStatus = "catch-all-fail";
          blacklist = true;
          catchAllFail++;
        }
      } else {
        emailStatus = "risky";
        blacklist = true;
        risky++;
      }

      await sb.from("buyer_contacts").update({ email_status: emailStatus }).eq("id", c.id);
      if (blacklist) {
        await sb.from("buyers").update({ is_blacklisted: true }).eq("id", c.buyer_id);
      }
    } catch { /* 개별 실패 */ }
  }

  await log(sb, jobId, "B", "completed",
    `직원B 완료: ${contacts.length}건 검증 — valid:${valid} invalid:${invalid} catch-all-pass:${catchAllPass} catch-all-fail:${catchAllFail} risky:${risky}`);
}

// ============================================
// 직원 C: Claude API — 기업 분석
// ============================================
async function agentC(sb: SB, jobId: string, _team: string) {
  await log(sb, jobId, "C", "running", "직원C 시작: 기업 분석");

  const API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!API_KEY) { await log(sb, jobId, "C", "failed", "ANTHROPIC_API_KEY 없음"); return; }

  // valid 또는 catch-all-pass 이메일의 기업만
  const { data: validContacts } = await sb.from("buyer_contacts")
    .select("buyer_id").in("email_status", ["valid", "catch-all-pass"]);

  if (!validContacts || validContacts.length === 0) {
    await log(sb, jobId, "C", "completed", "분석할 기업 없음"); return;
  }

  const validIds = [...new Set(validContacts.map((c: { buyer_id: string }) => c.buyer_id))];
  const { data: buyers } = await sb.from("buyers").select("*")
    .in("id", validIds).eq("is_blacklisted", false).is("recent_news", null);

  if (!buyers || buyers.length === 0) {
    await log(sb, jobId, "C", "completed", "분석할 새 기업 없음"); return;
  }

  let analyzed = 0;
  let totalCost = 0;

  for (const b of buyers) {
    try {
      const prompt = `You are a B2B analyst for SPS Cosmetics (spscos.com), a Korean OEM/ODM manufacturer.
Company: ${b.company_name} | Domain: ${b.domain || b.website}
Region: ${b.region} | Tier: ${b.tier} | Revenue: $${b.annual_revenue || "Unknown"}
Employees: ${b.employee_count || "Unknown"} | Open Jobs: ${b.open_jobs_signal ? "Yes" : "No"}

Analyze and return ONLY a JSON object (no markdown):
{
  "company_status": "1-2 sentence summary of recent products, campaigns, or partnerships",
  "kbeauty_interest": "Korean beauty brand history and interest level (low/medium/high with reasoning)",
  "recommended_formula": "Match to spscos.com categories: skincare→serums/creams, bodycare→lotions/oils, color→lip/eye, haircare→shampoo/treatment. List 3-5 specific products.",
  "proposal_angle": "One-line pitch angle for approaching this company"
}`;

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": API_KEY, "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001", max_tokens: 500,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!res.ok) {
        await log(sb, jobId, "C", "running", `Claude 실패 (${b.company_name}): ${res.status}`);
        continue;
      }

      const result = await res.json();
      const text = result.content?.[0]?.text || "";
      const inTok = result.usage?.input_tokens || 0;
      const outTok = result.usage?.output_tokens || 0;
      const cost = (inTok * 0.0000008) + (outTok * 0.000004);
      totalCost += cost;

      let json;
      try {
        const m = text.match(/\{[\s\S]*\}/);
        json = m ? JSON.parse(m[0]) : { raw: text };
      } catch { json = { raw: text }; }

      await sb.from("buyers").update({ recent_news: json }).eq("id", b.id);
      analyzed++;
    } catch { /* 개별 실패 */ }
  }

  await log(sb, jobId, "C", "completed",
    `직원C 완료: ${analyzed}개 기업 분석, API 비용 $${totalCost.toFixed(4)}`, 0, totalCost);
}

// ============================================
// 직원 D: Claude API — 이메일 초안
// ============================================
async function agentD(sb: SB, jobId: string, _team: string) {
  await log(sb, jobId, "D", "running", "직원D 시작: 이메일 초안 작성");

  const API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!API_KEY) { await log(sb, jobId, "D", "failed", "ANTHROPIC_API_KEY 없음"); return; }

  const { data: contacts } = await sb.from("buyer_contacts")
    .select("id, buyer_id, contact_name, contact_title, contact_email, email_status")
    .in("email_status", ["valid", "catch-all-pass"]);

  if (!contacts || contacts.length === 0) {
    await log(sb, jobId, "D", "completed", "이메일 작성할 담당자 없음"); return;
  }

  // 이미 초안이 있는 contact 제외
  const { data: existing } = await sb.from("email_drafts").select("buyer_contact_id");
  const existingSet = new Set((existing || []).map((d: { buyer_contact_id: string }) => d.buyer_contact_id));
  const newContacts = contacts.filter((c: { id: string }) => !existingSet.has(c.id));

  if (newContacts.length === 0) {
    await log(sb, jobId, "D", "completed", "새 초안 대상 없음"); return;
  }

  const buyerIds = [...new Set(newContacts.map((c: { buyer_id: string }) => c.buyer_id))];
  const { data: buyers } = await sb.from("buyers").select("*").in("id", buyerIds).eq("is_blacklisted", false);
  const buyerMap = new Map((buyers || []).map((b: { id: string }) => [b.id, b]));

  let drafted = 0;
  let pendingIntel = 0;
  let totalCost = 0;

  for (const c of newContacts) {
    const buyer = buyerMap.get(c.buyer_id) as Record<string, unknown> | undefined;
    if (!buyer) continue;

    const tier = buyer.tier as string;
    const analysis = buyer.recent_news as Record<string, unknown> | null;

    // 인텔 데이터 없으면 pending_intel로 저장하고 건너뜀
    if (!analysis || !analysis.company_status) {
      await sb.from("email_drafts").insert({
        buyer_contact_id: c.id,
        subject_line_1: "", subject_line_2: "", subject_line_3: "",
        body_first: "", body_followup: "",
        tier, spam_status: "pending_intel" as any,
      });
      pendingIntel++;
      continue;
    }

    // 인텔 데이터에서 필수 필드 추출
    const companyStatus = String(analysis.company_status || "");
    const kbeautyInterest = String(analysis.kbeauty_interest || "");
    const recommendedFormula = Array.isArray(analysis.recommended_formula)
      ? (analysis.recommended_formula as string[]).join(", ")
      : String(analysis.recommended_formula || "skincare, cosmetics");
    const proposalAngle = String(analysis.proposal_angle || "K-beauty OEM/ODM partnership opportunity");

    const followupDays = tier === "Tier1" ? 5 : 7;
    const salesAngle = tier === "Tier1"
      ? "Strategic partnership angle — position SPS as a long-term K-beauty OEM/ODM partner for their premium portfolio"
      : "Test order angle — low-risk 3,000 unit MOQ trial to test K-beauty products in their market";

    try {
      const prompt = `You write B2B cold emails for SPS Cosmetics (spscos.com), a Korean OEM/ODM manufacturer.
CEO: Teddy Shin (teddy@spscos.com) | MOQ: 3,000 units

Contact: ${c.contact_name} | Title: ${c.contact_title} | Company: ${buyer.company_name}
Region: ${buyer.region} | Tier: ${tier}

=== BUYER INTELLIGENCE (MUST reference in email) ===
Company Status: ${companyStatus}
K-Beauty Interest: ${kbeautyInterest}
Recommended Formula: ${recommendedFormula}
Proposal Angle: ${proposalAngle}
=== END INTELLIGENCE ===

Sales Strategy: ${salesAngle}

Return ONLY a JSON object (no markdown):
{
  "subject_line_1": "Company name + product category from recommended_formula (e.g., '${buyer.company_name} x K-Beauty ${recommendedFormula.split(",")[0]}')",
  "subject_line_2": "Reference company_status news/campaign (e.g., 'Re: ${buyer.company_name}'s ${companyStatus.slice(0, 30)}...')",
  "subject_line_3": "K-beauty trend angle (e.g., 'The K-beauty formula trending with ${buyer.region} buyers')",
  "body_first": "EXACTLY 120-150 words. Structure: Opening hook (1 sentence) → Relevance using title '${c.contact_title}', company '${buyer.company_name}', company_status AND proposal_angle (2 sentences) → SPS value prop mentioning recommended_formula (2 sentences) → CTA (1 sentence). Max 2 spscos.com links, max 1 external link. Sign off as Teddy Shin, CEO, SPS Cosmetics. NO spam words.",
  "body_followup": "EXACTLY 80-100 words. Reference first email → New angle using kbeauty_interest → Soft CTA. ${tier === "Tier1" ? "Note: send 5 days after first email" : "Note: send 7 days after first email"}. Sign off as Teddy."
}`;

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": API_KEY, "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001", max_tokens: 900,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!res.ok) continue;

      const result = await res.json();
      const text = result.content?.[0]?.text || "";
      const inTok = result.usage?.input_tokens || 0;
      const outTok = result.usage?.output_tokens || 0;
      totalCost += (inTok * 0.0000008) + (outTok * 0.000004);

      let json;
      try {
        const m = text.match(/\{[\s\S]*\}/);
        json = m ? JSON.parse(m[0]) : null;
      } catch { json = null; }
      if (!json) continue;

      await sb.from("email_drafts").insert({
        buyer_contact_id: c.id,
        subject_line_1: json.subject_line_1 || "", subject_line_2: json.subject_line_2 || "",
        subject_line_3: json.subject_line_3 || "",
        body_first: json.body_first || "", body_followup: json.body_followup || "",
        tier,
      });

      drafted++;
    } catch { /* 개별 실패 */ }
  }

  await log(sb, jobId, "D", "completed",
    `직원D 완료: 초안 ${drafted}개, 인텔대기 ${pendingIntel}개, API $${totalCost.toFixed(4)}`, 0, totalCost);
}

// ============================================
// 직원 E: Claude API 규칙 기반 스팸 검토
// ============================================

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

  // 1. 스팸 단어
  const found = SPAM_WORDS.filter((w) => lower.includes(w));
  if (found.length > 0) issues.push(`스팸단어 ${found.length}개: ${found.join(", ")}`);

  // 2. spscos.com 링크 3개+
  const spsLinks = (body.match(/spscos\.com/gi) || []).length;
  if (spsLinks >= 3) issues.push(`spscos.com 링크 ${spsLinks}개 (최대 2개)`);

  // 3. 외부 링크 2개+
  const extLinks = (body.match(/https?:\/\/(?!.*spscos\.com)[^\s)]+/gi) || []).length;
  if (extLinks >= 2) issues.push(`외부 링크 ${extLinks}개 (최대 1개)`);

  // 4. 대문자 3개+ 연속
  if (/\b[A-Z]{2,}(\s+[A-Z]{2,}){2,}\b/.test(body)) issues.push("대문자 단어 3개+ 연속");

  // 5. 느낌표 2개+
  if (/!{2,}/.test(full)) issues.push("느낌표 2개+ 연속");

  return issues;
}

function autoFixSpam(body: string): { fixed: string; fixes: string[] } {
  let fixed = body;
  const fixes: string[] = [];

  // 1. 스팸 단어 제거
  for (const w of SPAM_WORDS) {
    const re = new RegExp(`\\b${w}\\b`, "gi");
    if (re.test(fixed)) {
      fixed = fixed.replace(re, "").replace(/\s{2,}/g, " ").trim();
      fixes.push(`단어제거: "${w}"`);
    }
  }

  // 2. spscos.com 링크 → 최대 2개
  let spsCount = 0;
  fixed = fixed.replace(/spscos\.com/gi, (m: string) => { spsCount++; return spsCount <= 2 ? m : ""; });
  if (spsCount > 2) fixes.push(`spscos링크 ${spsCount}→2개`);

  // 3. 외부 링크 → 최대 1개
  const extRe = /https?:\/\/(?!.*spscos\.com)[^\s)]+/gi;
  let extCount = 0;
  fixed = fixed.replace(extRe, (m: string) => { extCount++; return extCount <= 1 ? m : ""; });
  if (extCount > 1) fixes.push(`외부링크 ${extCount}→1개`);

  // 4. 대문자 연속 → 소문자
  fixed = fixed.replace(/\b([A-Z]{2,}(?:\s+[A-Z]{2,}){2,})\b/g, (m: string) => {
    fixes.push("대문자연속→소문자");
    return m.toLowerCase();
  });

  // 5. 느낌표 다중 → 1개
  if (/!{2,}/.test(fixed)) {
    fixed = fixed.replace(/!{2,}/g, "!");
    fixes.push("느낌표→1개");
  }

  fixed = fixed.replace(/\s{2,}/g, " ").trim();
  return { fixed, fixes };
}

async function agentE(sb: SB, jobId: string, _team: string) {
  await log(sb, jobId, "E", "running", "직원E 시작: 규칙 기반 스팸 검토");

  const API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

  const { data: drafts } = await sb.from("email_drafts")
    .select("id, subject_line_1, body_first, body_followup")
    .is("spam_status", null);

  if (!drafts || drafts.length === 0) {
    await log(sb, jobId, "E", "completed", "스팸 검토할 이메일 없음"); return;
  }

  let checked = 0, passed = 0, rewritten = 0, flagged = 0, totalCost = 0;

  for (const d of drafts) {
    try {
      const issues = checkSpamRules(d.subject_line_1, d.body_first);

      if (issues.length === 0) {
        // 규칙 통과 → Claude 보조 검증
        let score = 10;

        if (API_KEY) {
          try {
            const res = await fetch("https://api.anthropic.com/v1/messages", {
              method: "POST",
              headers: {
                "x-api-key": API_KEY, "anthropic-version": "2023-06-01",
                "content-type": "application/json",
              },
              body: JSON.stringify({
                model: "claude-haiku-4-5-20251001", max_tokens: 50,
                messages: [{
                  role: "user",
                  content: `Rate this B2B email spam risk 1-10 (10=safe). Reply ONLY the number.\n\nSubject: ${d.subject_line_1}\n\n${d.body_first}`,
                }],
              }),
            });
            if (res.ok) {
              const r = await res.json();
              const s = parseInt((r.content?.[0]?.text || "").trim());
              if (!isNaN(s) && s >= 1 && s <= 10) score = s;
              totalCost += (r.usage?.input_tokens || 0) * 0.0000008 + (r.usage?.output_tokens || 0) * 0.000004;
            }
          } catch { /* Claude 실패 시 규칙 점수 유지 */ }
        }

        if (score >= 8) {
          await sb.from("email_drafts").update({ spam_score: score, spam_status: "pass" }).eq("id", d.id);
          passed++;
        } else {
          await sb.from("email_drafts").update({ spam_score: score, spam_status: "flag" }).eq("id", d.id);
          flagged++;
        }
      } else {
        // 규칙 위반 → 자동 수정 (최대 1회)
        const { fixed, fixes } = autoFixSpam(d.body_first);
        const retryIssues = checkSpamRules(d.subject_line_1, fixed);

        if (retryIssues.length === 0) {
          await sb.from("email_drafts").update({ body_first: fixed, spam_score: 8, spam_status: "rewrite" }).eq("id", d.id);
          rewritten++;
          await log(sb, jobId, "E", "running", `수정통과 (${d.id.slice(0, 8)}): ${fixes.join(", ")}`);
        } else {
          await sb.from("email_drafts").update({ body_first: fixed, spam_score: 5, spam_status: "flag" }).eq("id", d.id);
          flagged++;
          await log(sb, jobId, "E", "running", `검토필요 (${d.id.slice(0, 8)}): ${retryIssues.join(", ")}`);
        }
      }
      checked++;
    } catch { /* 개별 실패 */ }
  }

  await log(sb, jobId, "E", "completed",
    `직원E 완료: ${checked}건 (pass:${passed} rewrite:${rewritten} flag:${flagged})${totalCost > 0 ? ` API $${totalCost.toFixed(4)}` : ""}`,
    0, totalCost);
}

// ============================================
// 직원 F: 시스템 헬스 모니터링
// ============================================
async function agentF(sb: SB, jobId: string, _team: string) {
  await log(sb, jobId, "F", "running", "직원F 시작: 시스템 헬스 모니터링");

  const warnings: string[] = [];
  const today = new Date().toISOString().split("T")[0];

  // 1. Clay 크레딧 잔량 체크
  const CLAY_KEY = Deno.env.get("CLAY_API_KEY");
  if (CLAY_KEY) {
    try {
      const res = await fetch("https://api.clay.com/v3/credits", {
        headers: { Authorization: `Bearer ${CLAY_KEY}` },
      });
      if (res.ok) {
        const d = await res.json();
        const remaining = d.remaining_credits ?? d.credits ?? 0;
        if (remaining <= 500) warnings.push(`Clay 크레딧 ${remaining}개 남음 (≤500)`);
      }
    } catch { /* API 실패 */ }
  }

  // 2. ZeroBounce 잔여량 체크
  const ZB_KEY = Deno.env.get("ZEROBOUNCE_API_KEY");
  if (ZB_KEY) {
    try {
      const res = await fetch(`https://api.zerobounce.net/v2/getcredits?api_key=${ZB_KEY}`);
      if (res.ok) {
        const d = await res.json();
        const credits = d.Credits ?? 0;
        if (credits <= 200) warnings.push(`ZeroBounce ${credits}건 남음 (≤200)`);
      }
    } catch { /* API 실패 */ }
  }

  // 3. Claude API 일일 비용 체크
  const { data: costLogs } = await sb.from("pipeline_logs")
    .select("api_cost_usd").in("agent", ["C", "D", "E"])
    .gte("created_at", `${today}T00:00:00Z`);

  const dailyCost = (costLogs || []).reduce(
    (s: number, l: { api_cost_usd: number }) => s + (l.api_cost_usd || 0), 0);
  if (dailyCost > 5) warnings.push(`Claude API 일일 $${dailyCost.toFixed(2)} (>$5)`);

  // 4. 8시간 미완료 파이프라인
  const cutoff = new Date(Date.now() - 8 * 3600_000).toISOString();
  const { data: stale } = await sb.from("pipeline_jobs")
    .select("id").eq("status", "running").lt("created_at", cutoff);
  if (stale && stale.length > 0) warnings.push(`${stale.length}개 파이프라인 8시간+ 미완료`);

  // 5. 당일 신규 바이어 0건
  const { count: todayBuyers } = await sb.from("buyers")
    .select("id", { count: "exact", head: true })
    .gte("discovered_at", `${today}T00:00:00Z`);
  if ((todayBuyers || 0) === 0) warnings.push("당일 신규 바이어 0건");

  // 주간 리포트 (월요일 체크)
  const dayOfWeek = new Date().getDay();
  let weeklyReport = "";

  if (dayOfWeek === 1) {
    const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();

    // 총 발굴 기업 수
    const { count: weekBuyers } = await sb.from("buyers")
      .select("id", { count: "exact", head: true })
      .gte("discovered_at", weekAgo);

    // Tier 분류
    const { data: tierData } = await sb.from("buyers")
      .select("tier").gte("discovered_at", weekAgo);
    const t1 = (tierData || []).filter((b: { tier: string }) => b.tier === "Tier1").length;
    const t2 = (tierData || []).filter((b: { tier: string }) => b.tier === "Tier2").length;

    // 유효 이메일 통과율
    const { data: emailData } = await sb.from("buyer_contacts")
      .select("email_status").gte("created_at", weekAgo);
    const totalEmails = (emailData || []).length;
    const validEmails = (emailData || []).filter(
      (e: { email_status: string }) => e.email_status === "valid" || e.email_status === "catch-all-pass"
    ).length;
    const emailPassRate = totalEmails > 0 ? Math.round((validEmails / totalEmails) * 100) : 0;

    // 스팸 통과율
    const { data: spamData } = await sb.from("email_drafts")
      .select("spam_status").gte("created_at", weekAgo);
    const totalSpam = (spamData || []).length;
    const spamPass = (spamData || []).filter((s: { spam_status: string }) => s.spam_status === "pass").length;
    const spamRewrite = (spamData || []).filter((s: { spam_status: string }) => s.spam_status === "rewrite").length;
    const spamFlag = (spamData || []).filter((s: { spam_status: string }) => s.spam_status === "flag").length;

    // API 비용 합산
    const { data: weekCosts } = await sb.from("pipeline_logs")
      .select("agent, api_cost_usd, credits_used").gte("created_at", weekAgo);
    const clayCreds = (weekCosts || []).filter((l: { agent: string }) => l.agent === "A")
      .reduce((s: number, l: { credits_used: number }) => s + (l.credits_used || 0), 0);
    const claudeCost = (weekCosts || []).filter((l: { agent: string }) => ["C", "D", "E"].includes(l.agent))
      .reduce((s: number, l: { api_cost_usd: number }) => s + (l.api_cost_usd || 0), 0);

    // 이상 로그
    const { data: errorLogs } = await sb.from("pipeline_logs")
      .select("agent, message").eq("status", "failed").gte("created_at", weekAgo);

    weeklyReport = [
      `[주간 리포트] 발굴 ${weekBuyers || 0}개 (T1:${t1} T2:${t2})`,
      `이메일 통과율 ${emailPassRate}% (${validEmails}/${totalEmails})`,
      `스팸 pass:${spamPass} rewrite:${spamRewrite} flag:${spamFlag}`,
      `Clay ${clayCreds}크레딧 / Claude $${claudeCost.toFixed(2)}`,
      errorLogs && errorLogs.length > 0 ? `이상로그 ${errorLogs.length}건` : "이상로그 없음",
    ].join(" | ");
  }

  // 결과 기록
  const parts: string[] = [];
  if (warnings.length > 0) parts.push(`경고 ${warnings.length}건: ${warnings.join(" | ")}`);
  else parts.push("시스템 정상: 모든 API 상태 양호");
  if (weeklyReport) parts.push(weeklyReport);

  await log(sb, jobId, "F", "completed", parts.join("\n"));
}

// ============================================
// 메인 핸들러
// ============================================
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const sb = getSupabase();

  try {
    const { jobId } = await req.json();

    if (!jobId) {
      return new Response(
        JSON.stringify({ error: "jobId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: job, error: jobError } = await sb
      .from("pipeline_jobs").select("*").eq("id", jobId).single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const backgroundTask = (async () => {
      await sb.from("pipeline_jobs")
        .update({ status: "running", started_at: new Date().toISOString(), current_agent: "B" })
        .eq("id", jobId);

      // 바이어 발굴(구 직원 A)은 CSV 업로드로 대체됨 — B부터 실행
      // B는 내부적으로 buyer_contacts.email_status IS NULL 인 담당자를 직접 조회함
      const agents = [
        { name: "B", fn: agentB },
        { name: "C", fn: agentC },
        { name: "D", fn: agentD },
        { name: "E", fn: agentE },
        { name: "F", fn: agentF },
      ];

      let failed = false;

      for (const agent of agents) {
        await sb.from("pipeline_jobs").update({ current_agent: agent.name }).eq("id", jobId);
        try {
          await agent.fn(sb, jobId, job.team);
        } catch (error) {
          await log(sb, jobId, agent.name, "failed",
            `치명적 오류: ${error instanceof Error ? error.message : String(error)}`);
          failed = true;
          break;
        }
      }

      await sb.from("pipeline_jobs").update({
        status: failed ? "failed" : "completed",
        completed_at: new Date().toISOString(),
        current_agent: null,
      }).eq("id", jobId);
    })();

    // @ts-ignore: EdgeRuntime available in Supabase Edge Functions
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(backgroundTask);
    } else {
      backgroundTask.catch(console.error);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "파이프라인이 시작되었습니다. 브라우저를 닫으셔도 됩니다.",
        jobId,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
