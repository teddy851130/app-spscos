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
  // RLS bypass 필요 — service role key 사용
  // 사용자 커스텀 secret(SERVICE_ROLE_KEY) 우선, 없으면 Supabase 기본 주입 변수 폴백
  // (Supabase CLI는 SUPABASE_ 프리픽스 커스텀 secret 금지 → SERVICE_ROLE_KEY 네이밍)
  const serviceKey = Deno.env.get("SERVICE_ROLE_KEY")
    ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(Deno.env.get("SUPABASE_URL")!, serviceKey!);
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
// Claude API 호출 헬퍼 — 429 (rate limit) 시 자동 재시도
// ============================================
// 3개 팀 병렬 실행 + 배치 병렬 → 순간적으로 Claude 분당 한계 초과 발생.
// 429는 일시적이므로 짧은 대기 후 재시도하면 대부분 해결됨.
// 최대 4회 시도 (즉시 + 2초 + 5초 + 10초). Anthropic retry-after 헤더 우선 사용.
async function fetchClaudeWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3,
): Promise<Response> {
  const defaultDelays = [2000, 5000, 10000]; // 2초 → 5초 → 10초
  let lastRes: Response | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, options);
    if (res.status !== 429) return res;
    lastRes = res;
    if (attempt < maxRetries) {
      // Anthropic의 retry-after 헤더 우선 (초 단위), 없으면 기본 백오프
      const retryAfter = res.headers.get("retry-after");
      const headerDelayMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 0;
      const delayMs = headerDelayMs > 0 ? headerDelayMs : defaultDelays[attempt];
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return lastRes!;
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
  let httpErrorCount = 0;
  let sampleHttpError: string | null = null;

  for (const c of contacts) {
    try {
      const res = await fetch(
        `https://api.zerobounce.net/v2/validate?api_key=${ZB_KEY}&email=${encodeURIComponent(c.contact_email)}`
      );
      if (!res.ok) {
        httpErrorCount++;
        if (!sampleHttpError) {
          // 401=인증 실패, 402=결제 필요, 403=권한 없음, 429=레이트 리밋
          const hint = res.status === 401 ? " (인증 실패)"
            : res.status === 402 ? " (크레딧 부족/결제 필요)"
            : res.status === 403 ? " (접근 거부)"
            : res.status === 429 ? " (레이트 리밋)" : "";
          sampleHttpError = `HTTP ${res.status}${hint}`;
        }
        continue;
      }

      const r = await res.json();
      const zbStatus = String(r.status || "").toLowerCase();
      const tier = tierMap.get(c.buyer_id) || "Tier2";
      let emailStatus: string;
      let blacklist = false;

      // 블랙리스트 정책: Hard Bounce만 차단. invalid/catch-all-fail/risky는
      // email_status만 업데이트하고 블랙리스트 처리하지 않음.
      if (zbStatus === "valid") {
        emailStatus = "valid";
        valid++;
      } else if (zbStatus === "hard_bounce") {
        emailStatus = "invalid";
        blacklist = true; // hard bounce만 차단
        invalid++;
      } else if (zbStatus === "invalid") {
        emailStatus = "invalid";
        invalid++;
      } else if (zbStatus === "catch-all" || zbStatus === "catch_all") {
        if (tier === "Tier1") {
          emailStatus = "catch-all-pass";
          catchAllPass++;
        } else {
          emailStatus = "catch-all-fail";
          catchAllFail++;
        }
      } else {
        // unknown/spamtrap/abuse/do_not_mail 등
        emailStatus = "risky";
        risky++;
      }

      await sb.from("buyer_contacts").update({ email_status: emailStatus }).eq("id", c.id);
      if (blacklist) {
        await sb.from("buyers").update({ is_blacklisted: true }).eq("id", c.buyer_id);
      }
    } catch (e) {
      httpErrorCount++;
      if (!sampleHttpError) sampleHttpError = `fetch 실패: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  // API 오류가 있었으면 별도 로그 (F가 스캔하여 경고 생성)
  if (httpErrorCount > 0) {
    await log(sb, jobId, "B", "running",
      `ZeroBounce API 오류 ${httpErrorCount}건 — 샘플: ${sampleHttpError}`);
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

  // 이메일 유효성과 기업 분석은 별개 작업 — risky도 포함
  // (invalid/hard_bounce/catch-all-fail은 bounce 확정이라 분석 무의미하므로 제외)
  const { data: validContacts } = await sb.from("buyer_contacts")
    .select("buyer_id").in("email_status", ["valid", "catch-all-pass", "risky"]);

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
  let httpErrorCount = 0;
  let rateLimitCount = 0;
  let sampleHttpError: string | null = null;

  // 병렬 배치 처리 (10개씩) — Edge Function timeout 회피용
  // 순차 처리 시 기업 수 × ~8초 → 50개 이상이면 400초 한계 초과 위험
  const BATCH_SIZE_C = 5;
  for (let batchStart = 0; batchStart < buyers.length; batchStart += BATCH_SIZE_C) {
    const batch = buyers.slice(batchStart, batchStart + BATCH_SIZE_C);
    await Promise.all(batch.map(async (b: Record<string, unknown>) => {
      try {
        const prompt = `당신은 한국 OEM/ODM 화장품 제조사 SPS Cosmetics(spscos.com)의 B2B 애널리스트입니다.
아래 바이어 기업을 분석해주세요.

기업명: ${b.company_name}
도메인: ${b.domain || b.website}
지역: ${b.region} | Tier: ${b.tier} | 매출: $${b.annual_revenue || "미상"}
직원 수: ${b.employee_count || "미상"} | 채용 공고: ${b.open_jobs_signal ? "있음" : "없음"}

모든 필드 값을 **한국어로** 작성하세요. JSON 형식으로만 응답 (마크다운 금지):
{
  "company_status": "최근 제품·캠페인·파트너십 등 기업 현황 1~2문장 요약 (한국어)",
  "kbeauty_interest": "한국 화장품 브랜드 이력 및 K-beauty 관심도 — 낮음/중간/높음 중 하나를 판단 근거와 함께 (한국어)",
  "recommended_formula": "SPS 카테고리 매칭 — 스킨케어(세럼/크림), 바디케어(로션/오일), 컬러(립/아이), 헤어케어(샴푸/트리트먼트) 중 3~5개 제품 구체 추천 (한국어, 쉼표 구분)",
  "proposal_angle": "이 기업에 접근할 한 줄 영업 제안 각도 (한국어)"
}`;

        const res = await fetchClaudeWithRetry("https://api.anthropic.com/v1/messages", {
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
          httpErrorCount++;
          if (res.status === 429) rateLimitCount++;
          if (!sampleHttpError) sampleHttpError = `HTTP ${res.status}${res.status === 429 ? " (Claude 레이트 리밋)" : ""}`;
          return;
        }

        const result = await res.json();
        const text = result.content?.[0]?.text || "";
        const inTok = result.usage?.input_tokens || 0;
        const outTok = result.usage?.output_tokens || 0;
        const cost = (inTok * 0.0000008) + (outTok * 0.000004);
        totalCost += cost;

        // Claude가 ```json ... ``` 마크다운으로 감쌀 수 있음 — 마커만 제거 후 JSON.parse
        // 파싱 실패 시 null 저장 (raw 텍스트 저장 금지 — DB 오염 방지)
        let json: Record<string, unknown> | null;
        try {
          const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          json = JSON.parse(cleaned);
        } catch {
          json = null;
        }

        await sb.from("buyers").update({ recent_news: json }).eq("id", b.id);
        if (json !== null) analyzed++;
      } catch (e) {
        httpErrorCount++;
        if (!sampleHttpError) sampleHttpError = `fetch 실패: ${e instanceof Error ? e.message : String(e)}`;
      }
    }));
  }

  if (httpErrorCount > 0) {
    const rateLimitSuffix = rateLimitCount > 0 ? ` (429: ${rateLimitCount}건)` : "";
    await log(sb, jobId, "C", "running",
      `Claude API 오류 ${httpErrorCount}건${rateLimitSuffix} — 샘플: ${sampleHttpError}`);
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
  let httpErrorCount = 0;
  let rateLimitCount = 0;
  let sampleHttpError: string | null = null;

  // 병렬 배치 처리 (10개씩) — Edge Function timeout 회피용
  // 순차 처리 시 담당자 × ~10초 → 40명만 넘어도 400초 한계 초과 (기존 Europe 고착 원인)
  const BATCH_SIZE_D = 5;
  for (let batchStart = 0; batchStart < newContacts.length; batchStart += BATCH_SIZE_D) {
    const batch = newContacts.slice(batchStart, batchStart + BATCH_SIZE_D);
    await Promise.all(batch.map(async (c: Record<string, unknown>) => {
      const buyer = buyerMap.get(c.buyer_id as string) as Record<string, unknown> | undefined;
      if (!buyer) return;

      const tier = buyer.tier as string;
      const analysis = buyer.recent_news as Record<string, unknown> | null;

      // recent_news NULL 이면 이메일 작성 건너뜀 (row 만들지 않음)
      // 나중에 C가 recent_news 채우면 다음 D 실행에서 자연스럽게 처리됨
      if (!analysis || !analysis.company_status) {
        pendingIntel++;
        return;
      }

      // 인텔 데이터에서 필수 필드 추출
      const companyStatus = String(analysis.company_status || "");
      const kbeautyInterest = String(analysis.kbeauty_interest || "");
      const recommendedFormula = Array.isArray(analysis.recommended_formula)
        ? (analysis.recommended_formula as string[]).join(", ")
        : String(analysis.recommended_formula || "skincare, cosmetics");
      const proposalAngle = String(analysis.proposal_angle || "K-beauty OEM/ODM partnership opportunity");

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

        const res = await fetchClaudeWithRetry("https://api.anthropic.com/v1/messages", {
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

        if (!res.ok) {
          httpErrorCount++;
          if (res.status === 429) rateLimitCount++;
          if (!sampleHttpError) sampleHttpError = `HTTP ${res.status}${res.status === 429 ? " (Claude 레이트 리밋)" : ""}`;
          return;
        }

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
        if (!json) return;

        await sb.from("email_drafts").insert({
          buyer_contact_id: c.id,
          subject_line_1: json.subject_line_1 || "", subject_line_2: json.subject_line_2 || "",
          subject_line_3: json.subject_line_3 || "",
          body_first: json.body_first || "", body_followup: json.body_followup || "",
          tier,
        });

        drafted++;
      } catch (e) {
        httpErrorCount++;
        if (!sampleHttpError) sampleHttpError = `fetch 실패: ${e instanceof Error ? e.message : String(e)}`;
      }
    }));
  }

  if (httpErrorCount > 0) {
    const rateLimitSuffix = rateLimitCount > 0 ? ` (429: ${rateLimitCount}건)` : "";
    await log(sb, jobId, "D", "running",
      `Claude API 오류 ${httpErrorCount}건${rateLimitSuffix} — 샘플: ${sampleHttpError}`);
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
  let httpErrorCount = 0;
  let rateLimitCount = 0;
  let sampleHttpError: string | null = null;

  // 병렬 배치 처리 (10개씩) — Edge Function timeout 회피용
  // 순차 처리 시 초안 × ~4초 → 100건 이상이면 한계 근접
  const BATCH_SIZE_E = 5;
  for (let batchStart = 0; batchStart < drafts.length; batchStart += BATCH_SIZE_E) {
    const batch = drafts.slice(batchStart, batchStart + BATCH_SIZE_E);
    await Promise.all(batch.map(async (d: Record<string, unknown>) => {
      try {
        const issues = checkSpamRules(d.subject_line_1 as string, d.body_first as string);

        if (issues.length === 0) {
          // 규칙 통과 → Claude 보조 검증
          let score = 10;

          if (API_KEY) {
            try {
              const res = await fetchClaudeWithRetry("https://api.anthropic.com/v1/messages", {
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
              } else {
                httpErrorCount++;
                if (res.status === 429) rateLimitCount++;
                if (!sampleHttpError) sampleHttpError = `HTTP ${res.status}${res.status === 429 ? " (Claude 레이트 리밋)" : ""}`;
              }
            } catch (e) {
              httpErrorCount++;
              if (!sampleHttpError) sampleHttpError = `fetch 실패: ${e instanceof Error ? e.message : String(e)}`;
            }
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
          const { fixed, fixes } = autoFixSpam(d.body_first as string);
          const retryIssues = checkSpamRules(d.subject_line_1 as string, fixed);

          if (retryIssues.length === 0) {
            await sb.from("email_drafts").update({ body_first: fixed, spam_score: 8, spam_status: "rewrite" }).eq("id", d.id);
            rewritten++;
            await log(sb, jobId, "E", "running", `수정통과 (${(d.id as string).slice(0, 8)}): ${fixes.join(", ")}`);
          } else {
            await sb.from("email_drafts").update({ body_first: fixed, spam_score: 5, spam_status: "flag" }).eq("id", d.id);
            flagged++;
            await log(sb, jobId, "E", "running", `검토필요 (${(d.id as string).slice(0, 8)}): ${retryIssues.join(", ")}`);
          }
        }
        checked++;
      } catch { /* 규칙 체크 자체는 로컬이라 실패 가능성 낮음 */ }
    }));
  }

  if (httpErrorCount > 0) {
    const rateLimitSuffix = rateLimitCount > 0 ? ` (429: ${rateLimitCount}건)` : "";
    await log(sb, jobId, "E", "running",
      `Claude API 오류 ${httpErrorCount}건${rateLimitSuffix} — 샘플: ${sampleHttpError}`);
  }

  await log(sb, jobId, "E", "completed",
    `직원E 완료: ${checked}건 (pass:${passed} rewrite:${rewritten} flag:${flagged})${totalCost > 0 ? ` API $${totalCost.toFixed(4)}` : ""}`,
    0, totalCost);
}

// ============================================
// 직원 F: 파이프라인 검증 + 시스템 모니터링
// ============================================
// 이 job의 B~E 로그를 전부 스캔해서 실제 오류/누락을 구체 경고로 기록.
// 웹앱 파서 호환을 위해 경고 포맷은 "경고 N건: msg1 | msg2" 유지.
async function agentF(sb: SB, jobId: string, _team: string) {
  await log(sb, jobId, "F", "running", "직원F 시작: 파이프라인 검증");

  const warnings: string[] = [];

  // === 1. 이번 job의 B~E 로그 전체 스캔 ===
  const { data: jobLogs } = await sb.from("pipeline_logs")
    .select("agent, status, message")
    .eq("job_id", jobId)
    .in("agent", ["B", "C", "D", "E"]);

  const logs = (jobLogs || []) as { agent: string; status: string; message: string }[];

  // 1-a. status='failed' 항목 — 치명적 오류
  for (const l of logs.filter((x) => x.status === "failed")) {
    warnings.push(`직원 ${l.agent} 치명적 오류: ${(l.message || "").slice(0, 100)}`);
  }

  // 1-b. HTTP 오류/크레딧 부족/레이트 리밋 키워드 스캔 (running 로그 대상)
  // 각 직원별 첫 에러 메시지만 샘플로 수집해 중복 방지
  const ERROR_RE = /\b(401|402|403|404|429|500|502|503)\b|크레딧\s*(부족|없음|소진)|레이트\s*리밋|인증\s*실패|API\s*오류|API\s*키\s*없음/i;
  const byAgentError: Record<string, string> = {};
  for (const l of logs) {
    if (l.status === "failed") continue;
    if (ERROR_RE.test(l.message || "") && !byAgentError[l.agent]) {
      byAgentError[l.agent] = (l.message || "").slice(0, 100);
    }
  }
  for (const [agent, msg] of Object.entries(byAgentError)) {
    warnings.push(`직원 ${agent} API 오류: ${msg}`);
  }

  // 1-c. 각 직원의 completed 로그에서 "없음" 감지 (처리 대상 0건)
  const completedByAgent = new Map<string, string>();
  for (const l of logs) {
    if (l.status === "completed") completedByAgent.set(l.agent, l.message || "");
  }
  for (const agent of ["B", "C", "D", "E"]) {
    const msg = completedByAgent.get(agent);
    if (!msg) {
      // 실행 자체가 누락/중단된 케이스 (치명적 오류는 1-a에서 이미 잡힘)
      if (!logs.some((l) => l.agent === agent && l.status === "failed")) {
        warnings.push(`직원 ${agent} 완료 로그 없음 (실행 누락 또는 중단)`);
      }
      continue;
    }
    if (/없음/.test(msg)) {
      warnings.push(`직원 ${agent} 처리 대상 0건: ${msg.slice(0, 80)}`);
    }
  }

  // === 2. 데이터 상태 검증 ===
  // 2-a. B 미처리: email_status=null 인데 이메일이 있는 담당자
  const { count: nullStatusCount } = await sb.from("buyer_contacts")
    .select("id", { count: "exact", head: true })
    .is("email_status", null)
    .not("contact_email", "is", null)
    .not("contact_email", "eq", "");
  if ((nullStatusCount || 0) > 0) {
    warnings.push(`직원 B 미처리 데이터: email_status=null ${nullStatusCount}건 남음`);
  }

  // 2-b. C 미처리: Tier1/2 + blacklist=false + recent_news=null
  // (Tier3는 C가 의도적으로 분석하지 않으므로 제외)
  const { count: nullNewsCount } = await sb.from("buyers")
    .select("id", { count: "exact", head: true })
    .in("tier", ["Tier1", "Tier2"])
    .eq("is_blacklisted", false)
    .is("recent_news", null);
  if ((nullNewsCount || 0) > 0) {
    warnings.push(`직원 C 미처리 데이터: recent_news=null ${nullNewsCount}건 (Tier1/2)`);
  }

  // 2-c. D 이번 실행 중 email_drafts 생성 0건 (started_at 이후 기준)
  const { data: job } = await sb.from("pipeline_jobs")
    .select("started_at").eq("id", jobId).single();
  const startedAt = (job as { started_at?: string } | null)?.started_at;
  // D가 "처리 대상 없음"을 이미 로그에 남겼다면 1-c에서 잡히므로 중복 방지
  const dAlreadyWarned = /없음/.test(completedByAgent.get("D") || "");
  if (startedAt && !dAlreadyWarned) {
    const { count: draftCount } = await sb.from("email_drafts")
      .select("id", { count: "exact", head: true })
      .gte("created_at", startedAt);
    if ((draftCount || 0) === 0) {
      warnings.push(`직원 D 결과 없음: 이번 실행에서 email_drafts 0건 생성`);
    }
  }

  // === 3. ZeroBounce API 상태 (실제 응답 코드 확인) ===
  const ZB_KEY = Deno.env.get("ZEROBOUNCE_API_KEY");
  if (!ZB_KEY) {
    warnings.push("ZEROBOUNCE_API_KEY 환경변수 없음");
  } else {
    try {
      const res = await fetch(`https://api.zerobounce.net/v2/getcredits?api_key=${ZB_KEY}`);
      if (res.status === 401 || res.status === 403) {
        warnings.push(`ZeroBounce 인증 실패 (HTTP ${res.status})`);
      } else if (res.status === 402) {
        warnings.push(`ZeroBounce 결제 필요 (HTTP 402)`);
      } else if (!res.ok) {
        warnings.push(`ZeroBounce API 응답 오류 (HTTP ${res.status})`);
      } else {
        const d = await res.json();
        const credits = d.Credits ?? 0;
        if (credits <= 0) warnings.push(`ZeroBounce 크레딧 소진`);
        else if (credits <= 200) warnings.push(`ZeroBounce ${credits}건 남음 (≤200)`);
      }
    } catch (e) {
      warnings.push(`ZeroBounce 통신 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // === 4. Anthropic API 키 존재 확인 ===
  if (!Deno.env.get("ANTHROPIC_API_KEY")) {
    warnings.push("ANTHROPIC_API_KEY 환경변수 없음");
  }

  // === 5. 8시간+ 미완료 파이프라인 ===
  const cutoff = new Date(Date.now() - 8 * 3600_000).toISOString();
  const { data: stale } = await sb.from("pipeline_jobs")
    .select("id").eq("status", "running").lt("created_at", cutoff);
  if (stale && stale.length > 0) {
    warnings.push(`${stale.length}개 파이프라인 8시간+ 미완료`);
  }

  // === 결과 기록 ===
  // 포맷: "경고 N건: msg1 | msg2"  (Pipeline.tsx:345 파서 호환)
  if (warnings.length === 0) {
    await log(sb, jobId, "F", "completed", "시스템 정상: 모든 직원 정상 완료");
  } else {
    await log(sb, jobId, "F", "completed",
      `경고 ${warnings.length}건: ${warnings.join(" | ")}`);
  }
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
      let failed = false;

      try {
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
      } catch (error) {
        // backgroundTask 자체의 예기치 못한 예외 처리
        failed = true;
        try {
          await log(sb, jobId, "F", "failed",
            `파이프라인 예외 종료: ${error instanceof Error ? error.message : String(error)}`);
        } catch { /* log 실패는 무시 */ }
      } finally {
        // 어떤 상황에서도 status를 반드시 완료 상태로 업데이트
        try {
          await sb.from("pipeline_jobs").update({
            status: failed ? "failed" : "completed",
            completed_at: new Date().toISOString(),
            current_agent: null,
          }).eq("id", jobId);
        } catch { /* DB 업데이트 실패는 무시 */ }
      }
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
