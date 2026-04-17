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

  // PR4: 크레딧 프리체크 — 0이면 무의미한 검증 호출을 피하고 즉시 종료.
  // 401/402 등 인증 오류도 여기서 잡아 본 검증 루프 진입 전에 경고.
  try {
    const credRes = await fetch(`https://api.zerobounce.net/v2/getcredits?api_key=${ZB_KEY}`);
    if (credRes.status === 401 || credRes.status === 403) {
      await log(sb, jobId, "B", "failed", `ZeroBounce 인증 실패 (HTTP ${credRes.status}) — API 키 확인 필요`);
      return;
    }
    if (credRes.status === 402) {
      await log(sb, jobId, "B", "failed", "ZeroBounce 결제 필요 (HTTP 402) — 크레딧 충전 후 재실행");
      return;
    }
    if (credRes.ok) {
      const cd = await credRes.json();
      const credits = Number(cd.Credits ?? 0);
      if (credits <= 0) {
        await log(sb, jobId, "B", "failed", "ZeroBounce 크레딧 0건 — 충전 후 재실행");
        return;
      }
      // 정보성 로그 (직원 F가 200건 이하면 별도 경고 생성)
      await log(sb, jobId, "B", "running", `ZeroBounce 크레딧 ${credits}건 사용 가능`);
    }
    // credRes.status가 5xx 등 일시 오류면 본 루프 진행 — 개별 호출에서 다시 처리됨
  } catch (e) {
    await log(sb, jobId, "B", "running",
      `ZeroBounce 크레딧 사전 조회 실패: ${e instanceof Error ? e.message : String(e)} — 본 루프 진행`);
  }

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
// PR4 인텔 품질 점수 계산 (0~100)
// 4개 핵심 필드의 길이/구체성을 기반으로 채점.
//   company_status: 최대 40점 (구체적 사실 언급이 핵심)
//   kbeauty_interest: 최대 20점
//   recommended_formula: 최대 20점 (3개 이상 품목)
//   proposal_angle: 최대 20점
// 임계값 60점. 단순 합산 시 "큰 필드 두 개만 차도 통과" 문제가 있어 라운드1 수정으로
// 4개 필드 모두 최소 점수(부분 점수 포함) 이상이어야만 합격으로 본다.
//   각 필드 1점 이상 = "최소한 형식 충족". 그 후 합산 점수가 임계값 이상이어야 합격.
const INTEL_QUALITY_THRESHOLD = 60;

function computeIntelScore(intel: Record<string, unknown>): number {
  // 각 필드의 부분 점수 계산
  const companyStatus = String(intel.company_status || "").trim();
  const csScore = companyStatus.length >= 30 ? 40 : companyStatus.length >= 15 ? 20 : 0;

  const kbeautyInterest = String(intel.kbeauty_interest || "").trim();
  const kiScore = kbeautyInterest.length >= 20 ? 20 : kbeautyInterest.length >= 10 ? 10 : 0;

  const rawFormula = intel.recommended_formula;
  const formulas = Array.isArray(rawFormula)
    ? rawFormula.map((x) => String(x).trim()).filter((x) => x.length > 0)
    : String(rawFormula || "").split(/[,，、]/).map((x) => x.trim()).filter((x) => x.length > 0);
  const fmScore = formulas.length >= 3 ? 20 : formulas.length >= 2 ? 10 : 0;

  const proposalAngle = String(intel.proposal_angle || "").trim();
  const paScore = proposalAngle.length >= 20 ? 20 : proposalAngle.length >= 10 ? 10 : 0;

  // 4개 필드 중 하나라도 0점이면 전체 0점 (필드 누락은 불합격 확정).
  // → "큰 필드 두 개만 차서 임계값 통과" 우회 차단.
  if (csScore === 0 || kiScore === 0 || fmScore === 0 || paScore === 0) return 0;

  return csScore + kiScore + fmScore + paScore;
}

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
  // PR4: analysis_failed_at IS NULL 조건 추가 — 이전에 분석 포기한 바이어 재분석 차단 (무한 루프 방지).
  //      또한 status='intel_failed' 바이어도 제외.
  const { data: buyers } = await sb.from("buyers").select("*")
    .in("id", validIds)
    .eq("is_blacklisted", false)
    .is("recent_news", null)
    .is("analysis_failed_at", null)
    .neq("status", "intel_failed");

  if (!buyers || buyers.length === 0) {
    await log(sb, jobId, "C", "completed", "분석할 새 기업 없음"); return;
  }

  let analyzed = 0;
  let totalCost = 0;
  let httpErrorCount = 0;
  let rateLimitCount = 0;
  let sampleHttpError: string | null = null;

  // PR4: 품질 게이트 통계 — 재시도·실패 카운트 추적
  let retriedCount = 0;
  let intelFailedCount = 0;

  // Claude 기업 분석 호출 — 1차/재시도 프롬프트 분기
  async function callClaudeIntel(
    b: Record<string, unknown>,
    retryMode: boolean,
  ): Promise<{ json: Record<string, unknown> | null; cost: number; httpError?: string; rateLimited?: boolean }> {
    const retryHint = retryMode
      ? `\n\n[재시도] 이전 응답이 품질 기준(각 필드 구체성·풍부함) 미달이었습니다.
- company_status는 최소 30자, 실제 구체적 사실(브랜드·캠페인·제품명 등) 포함
- kbeauty_interest는 최소 20자, 판단 근거 명시
- recommended_formula는 **3개 이상** 구체 품목
- proposal_angle은 최소 20자, 실행 가능한 한 줄 제안
각 필드를 반드시 채우되 추측성 내용 금지.`
      : "";

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
}${retryHint}`;

    const res = await fetchClaudeWithRetry("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": API_KEY!, "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001", max_tokens: retryMode ? 700 : 500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const rateLimited = res.status === 429;
      return {
        json: null, cost: 0, rateLimited,
        httpError: `HTTP ${res.status}${rateLimited ? " (Claude 레이트 리밋)" : ""}`,
      };
    }

    const result = await res.json();
    const text = result.content?.[0]?.text || "";
    const inTok = result.usage?.input_tokens || 0;
    const outTok = result.usage?.output_tokens || 0;
    const cost = (inTok * 0.0000008) + (outTok * 0.000004);

    let json: Record<string, unknown> | null;
    try {
      const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      json = JSON.parse(cleaned);
    } catch {
      json = null;
    }
    return { json, cost };
  }

  // 병렬 배치 처리 (5개씩) — Edge Function timeout 회피용
  const BATCH_SIZE_C = 5;
  for (let batchStart = 0; batchStart < buyers.length; batchStart += BATCH_SIZE_C) {
    const batch = buyers.slice(batchStart, batchStart + BATCH_SIZE_C);
    await Promise.all(batch.map(async (b: Record<string, unknown>) => {
      try {
        // 1차 호출
        const first = await callClaudeIntel(b, false);
        totalCost += first.cost;
        if (first.httpError) {
          httpErrorCount++;
          if (first.rateLimited) rateLimitCount++;
          if (!sampleHttpError) sampleHttpError = first.httpError;
          return; // 네트워크 오류는 다음 파이프라인 실행에서 재시도
        }

        let finalJson = first.json;
        let score = finalJson ? computeIntelScore(finalJson) : 0;

        // 품질 미달(파싱 실패 또는 점수 < 임계값) → 재시도 1회
        if (!finalJson || score < INTEL_QUALITY_THRESHOLD) {
          retriedCount++;
          const retry = await callClaudeIntel(b, true);
          totalCost += retry.cost;
          if (retry.httpError) {
            httpErrorCount++;
            if (retry.rateLimited) rateLimitCount++;
            if (!sampleHttpError) sampleHttpError = retry.httpError;
            // PR4 라운드1 수정: 재시도 네트워크 오류 시 무한 루프 방지.
            //   1차 결과가 있으면 그것으로 최종 판정 진행 (아래 분기에서 intel_failed 또는 합격 결정).
            //   1차도 없으면 다음 실행에서 재시도 허용 — recent_news/analysis_failed_at 모두 NULL이라 재진입 가능.
            //   (1차도 없는 경우는 이론상 불가능: callClaudeIntel은 2xx 응답이면 json 또는 null을 반환)
            if (!finalJson) return;
          } else if (retry.json) {
            const retryScore = computeIntelScore(retry.json);
            if (retryScore >= score) { finalJson = retry.json; score = retryScore; }
          }
        }

        // 최종 판정
        if (finalJson && score >= INTEL_QUALITY_THRESHOLD) {
          // 합격 — recent_news + intel_score 저장
          await sb.from("buyers")
            .update({ recent_news: finalJson, intel_score: score })
            .eq("id", b.id);
          analyzed++;
        } else {
          // 불합격 — intel_failed 마킹.
          // 1차 응답이 있으면 recent_news에 보존하여 사용자가 "왜 실패했나" 확인 가능.
          // 무한 재분석 차단을 위해 analysis_failed_at 기록.
          await sb.from("buyers").update({
            recent_news: finalJson, // 점수 미달 인텔도 진단용으로 보존
            analysis_failed_at: new Date().toISOString(),
            intel_score: score,
            status: "intel_failed",
          }).eq("id", b.id);
          intelFailedCount++;
        }
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
    `직원C 완료: 합격 ${analyzed} · 재시도 ${retriedCount} · 불합격(intel_failed) ${intelFailedCount}, API $${totalCost.toFixed(4)}`,
    0, totalCost);
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

  // 미발송 초안이 있는 contact만 제외 (발송된 초안이 있는 컨택트는 팔로업 초안 생성 대상)
  // PR1 이전에는 is_sent 필터 없이 전부 제외해서 과거 발송된 컨택트가 영원히 재생성 안 되는 버그 존재.
  const { data: existing } = await sb
    .from("email_drafts")
    .select("buyer_contact_id")
    .eq("is_sent", false);
  const existingSet = new Set((existing || []).map((d: { buyer_contact_id: string }) => d.buyer_contact_id));
  const newContacts = contacts.filter((c: { id: string }) => !existingSet.has(c.id));

  if (newContacts.length === 0) {
    await log(sb, jobId, "D", "completed", "새 초안 대상 없음"); return;
  }

  const buyerIds = [...new Set(newContacts.map((c: { buyer_id: string }) => c.buyer_id))];
  // PR4: status='intel_failed' 바이어는 인텔 품질 미달이므로 메일 초안 작성 대상에서 제외
  const { data: buyers } = await sb.from("buyers").select("*")
    .in("id", buyerIds)
    .eq("is_blacklisted", false)
    .neq("status", "intel_failed");
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
        // ADR-024: v3 프롬프트 — "CIA + Challenger Sale" 프레임워크 채택.
        //   Jason Bay의 CIA (Context - Insight - Ask) + Challenger Sale의 Teach-Tailor-Take control.
        //   - Context: 바이어 회사의 구체 고유명사 2개 이상 인용 → "연구한 티" 극대화
        //   - Insight: 업계 패턴/관점을 제공해 바이어 상황에 맞춤 (단순 자사 소개 아님)
        //   - Ask: 단일·저부담·타이밍 개방형 + P.S.에 "3분 미리보기" 링크 1개
        //   - 세일즈 클리셰 15개 명시 금지 (unlock/synergy/leverage/game-changer 등)
        //   - You-to-Me 비율 5:1 + Template 냄새 금지 + PS 회신 유도(옵션 B 링크)
        const prompt = `You write B2B cold emails for SPS Cosmetics (spscos.com), a Korean OEM/ODM manufacturing partner.
CEO: Teddy Shin (teddy@spscos.com)

SPS positioning (describe capability, do NOT quote hard numbers):
- Fast turnaround and responsiveness — rapid quoting, fast sampling, CEO as direct point of contact
- Manufacturing partner network covering every cosmetic category: skincare, bodycare, color, haircare, fragrance
- Multi-country export experience — shipments across GCC, USA, EU and beyond
- Full-turnkey, fully bespoke service — price, quantity, quality, design tailored to YOUR preferences
- Single-point partner: formulation, packaging, regulatory, logistics all handled through one relationship

Contact: ${c.contact_name} | Title: ${c.contact_title} | Company: ${buyer.company_name}
Region: ${buyer.region} | Tier: ${tier}

=== BUYER INTELLIGENCE (for Context section — quote SPECIFIC proper nouns from here) ===
Company Status: ${companyStatus}
K-Beauty Interest: ${kbeautyInterest}
Recommended Category (INTERNAL; may be mentioned at category level in body_followup only): ${recommendedFormula}
Proposal Angle: ${proposalAngle}
=== END INTELLIGENCE ===

Sales Strategy: ${salesAngle}

FRAMEWORK — CIA (Context - Insight - Ask) + Challenger Sale's Take-control tone.

(1) CONTEXT — opening 1-2 sentences. Reference AT LEAST TWO specific proper nouns pulled from Company Status or Proposal Angle (product/brand names, cities, partners, recent launches, campaigns). The goal is to prove you actually read about ${buyer.company_name}. Neutral, respectful, not surveillance-style. Good starters: "Read about...", "Saw your launch of...", "With your move into...". NEVER use "we observed", "it appears that", "based on our analysis".

(2) INSIGHT — 2-3 sentences. Teach something useful about the industry pattern that ${buyer.company_name} likely faces at their current stage (use K-Beauty Interest and regional context). Frame it as a non-obvious observation you've seen with similar brands — e.g., "what I've seen with ${buyer.region} brands scaling from X to Y is that the bottleneck usually isn't [obvious thing], it's [specific thing]". This is where you differentiate as an industry peer, not a vendor. Tailor the insight to THEIR situation.

(3) TRANSITION TO SPS — 1-2 sentences of confident take-control. "We built SPS for exactly that" style. Describe capability at CATEGORY level only. NO specific product names, NO hard numbers.

(4) ASK — 1 sentence. Single, low-commitment, timing-open. Example: "If it's worth a quick 15 minutes to see whether we fit ${buyer.company_name}'s next 12 months, I'll make the time on your schedule." NOT multiple-choice. NOT a list of questions.

(5) SIGN-OFF — just "Teddy" on its own line (first-name only feels peer-to-peer for cold; save full title for signature).

(6) P.S. (mandatory) — single line with ONE link for the buyer to self-preview capabilities if curious. Use EXACTLY this format: "P.S. 3-minute preview of what we do: https://spscos.com/" (this is a tracked click signal — keep it short and natural, no hard sell wording).

HARD CONSTRAINTS — if violated the draft fails:
- MUST contain at least TWO specific proper nouns from ${buyer.company_name}'s intelligence. Generic references like "your company", "your brand", "your region" alone = Template smell = rejection.
- body_first MUST NOT contain: specific SPS product names / SKUs / formula codes, hard numbers (MOQ X, X-week lead time, percentages, price ranges), multiple-choice questions "(a)/(b)/(c)", bullet lists longer than 4 items.
- You-to-Me ratio: the words "You / Your / ${buyer.company_name}'s" MUST appear at least 5x more often than "We / Our / SPS" in the body. Front-load "you" language.
- Tone: peer-to-peer, warm, direct, industry-insider. No hype. No surveillance language.
- The entire email (subject AND body AND PS) MUST be English only. No Korean, Hanja, or non-Latin scripts.
- BANNED sales clichés (do not use in any form or synonym — these immediately trigger spam-tone flags): unlock, synergy, leverage, game-changer, game changer, best-in-class, world-class, world-leading, industry-leading, state-of-the-art, cutting-edge, revolutionary, next-level, take your [X] to the next level, positioned to, touch base, circle back, just wanted to, I hope this finds you well, amazing, ultimate.
- BANNED spam trigger words (case-insensitive): free, guarantee, guaranteed, winner, congratulations, limited time, act now, click here, no cost, risk free, risk-free, exclusive deal, don't miss, urgent, buy now, order now, special promotion, no obligation, double your, earn extra, cash bonus.
- Links: exactly 1 spscos.com link in the P.S. (not in body). No external links. No multiple consecutive uppercase words. No "!!" or repeated exclamation marks.

Return ONLY a JSON object (no markdown):
{
  "subject_line_1": "3-7 words, reference a specific ${buyer.company_name} fact + a light observation hook (e.g., '${buyer.company_name}'s [specific thing] — a quick thought')",
  "subject_line_2": "Reference-based subject using company_status (under 60 chars, e.g., 'Re: ${buyer.company_name}'s ${companyStatus.slice(0, 30)}')",
  "subject_line_3": "Insight-tease subject (under 60 chars, e.g., 'What most OEMs miss when ${buyer.region} brands scale')",
  "body_first": "120-220 words. CIA + Challenger structure: (1) Context with 2+ specific proper nouns from the intelligence, (2) Insight teaching a non-obvious industry pattern tailored to ${buyer.company_name}, (3) Transition to SPS capability at category level, (4) Single low-commitment Ask with open timing, (5) 'Teddy' sign-off on its own line, (6) 'P.S. 3-minute preview of what we do: https://spscos.com/' exactly.",
  "body_followup": "80-130 words, ENGLISH ONLY. Sent ${tier === "Tier1" ? "5" : "7"} days after first. Brief reference to first email → one new specific angle (use kbeauty_interest or recommended category at CATEGORY level only, NO product name) → soft open-ended nudge to chat. Sign off 'Teddy'. No P.S. needed here."
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

        // 한글 혼입 방지 최종 가드 — Claude가 지시를 어기고 한글을 섞어 반환한 경우 스킵.
        // body_first와 body_followup에 한글(가~힣) 또는 한자가 포함되면 저장하지 않음.
        const nonLatinRe = /[\u3131-\uD79D\u4E00-\u9FFF]/;
        const subj = String(json.subject_line_1 || "");
        const bodyFirst = String(json.body_first || "");
        const bodyFollow = String(json.body_followup || "");
        if (nonLatinRe.test(subj) || nonLatinRe.test(bodyFirst) || nonLatinRe.test(bodyFollow)) {
          pendingIntel++; // 재시도 대상으로 처리
          return;
        }

        // email_drafts INSERT — buyer_id 포함 (PR1 NOT NULL 제약)
        // UNIQUE(buyer_contact_id) WHERE is_sent=false 위반(23505) 시: 동시에 다른 경로에서
        // 초안이 먼저 생성된 것이므로 조용히 스킵 (배치 병렬 또는 generate-draft와 동시 실행 케이스).
        const { error: dInsErr } = await sb.from("email_drafts").insert({
          buyer_id: c.buyer_id,
          buyer_contact_id: c.id,
          subject_line_1: subj, subject_line_2: json.subject_line_2 || "",
          subject_line_3: json.subject_line_3 || "",
          body_first: bodyFirst, body_followup: bodyFollow,
          tier,
        });

        if (dInsErr) {
          const code = (dInsErr as { code?: string }).code;
          if (code === "23505") {
            // 동시 INSERT로 UNIQUE 위반 — 경합 상대가 초안을 이미 저장함. 정상 케이스.
            return;
          }
          // 그 외 DB 오류는 httpErrorCount로 집계 (상위 catch에서 처리되지 않으므로 여기서 명시)
          httpErrorCount++;
          if (!sampleHttpError) sampleHttpError = `DB INSERT 실패: ${dInsErr.message}`;
          return;
        }

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
      // PR6.7: \s{2,}는 줄바꿈까지 포함해 문단 구조를 파괴. [ \t]{2,}로 같은 줄 내 공백만 압축.
      fixed = fixed.replace(re, "").replace(/[ \t]{2,}/g, " ");
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

  // PR6.7: 마지막 정리도 줄바꿈 보존. [ \t]만 압축, 양끝 공백만 trim.
  fixed = fixed.replace(/[ \t]{2,}/g, " ").trim();
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
          // 규칙 통과 → Claude 보조 검증 (ADR-024: JSON 응답으로 reason까지 수집 → flag 원인 pipeline_logs 기록)
          let score = 10;
          let claudeReason: string | null = null;

          if (API_KEY) {
            try {
              const res = await fetchClaudeWithRetry("https://api.anthropic.com/v1/messages", {
                method: "POST",
                headers: {
                  "x-api-key": API_KEY, "anthropic-version": "2023-06-01",
                  "content-type": "application/json",
                },
                body: JSON.stringify({
                  model: "claude-haiku-4-5-20251001", max_tokens: 200,
                  messages: [{
                    role: "user",
                    content: `Rate this B2B cold email's spam/sales-tone risk on a 1-10 scale (10 = clean/natural, 1 = obvious spam). If score < 8, briefly state what would get it flagged (sales clichés, template smell, hype language, hard sell CTA, etc.). Reply ONLY a JSON object, no markdown:\n{"score": <integer 1-10>, "reason": "<one short Korean sentence; empty string if score >= 8>"}\n\nSubject: ${d.subject_line_1}\n\n${d.body_first}`,
                  }],
                }),
              });
              if (res.ok) {
                const r = await res.json();
                const text = (r.content?.[0]?.text || "").trim();
                try {
                  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
                  const parsed = JSON.parse(cleaned);
                  if (typeof parsed.score === "number" && parsed.score >= 1 && parsed.score <= 10) score = parsed.score;
                  if (typeof parsed.reason === "string" && parsed.reason.trim()) claudeReason = parsed.reason.trim();
                } catch {
                  // JSON 파싱 실패 → 구 형식(숫자만)으로 폴백해 하위 호환 유지
                  const s = parseInt(text);
                  if (!isNaN(s) && s >= 1 && s <= 10) score = s;
                }
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
            // ADR-024: Claude가 판단한 flag 사유를 pipeline_logs에 기록 → Teddy가 원인 추적 가능.
            // email_drafts 스키마 확장 없이 로그 레벨만 개선 (migration 불필요).
            await log(sb, jobId, "E", "running",
              `검토필요 (${(d.id as string).slice(0, 8)}, score=${score}): ${(claudeReason || "Claude 사유 미수집").slice(0, 200)}`);
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
        JSON.stringify({ success: false, error: "jobId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: job, error: jobError } = await sb
      .from("pipeline_jobs").select("*").eq("id", jobId).single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ success: false, error: "Job not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const backgroundTask = (async () => {
      let failed = false;
      let failureMessage: string | null = null;  // error_log에 저장할 요약 (UI 표시용)

      try {
        await sb.from("pipeline_jobs")
          .update({ status: "running", started_at: new Date().toISOString(), current_agent: "B", error_log: null })
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
            const errMsg = error instanceof Error ? error.message : String(error);
            await log(sb, jobId, agent.name, "failed", `치명적 오류: ${errMsg}`);
            failed = true;
            failureMessage = `직원 ${agent.name} 치명적 오류: ${errMsg}`;
            break;
          }
        }
      } catch (error) {
        // backgroundTask 자체의 예기치 못한 예외 처리
        failed = true;
        failureMessage = `파이프라인 예외 종료: ${error instanceof Error ? error.message : String(error)}`;
        try {
          await log(sb, jobId, "F", "failed", failureMessage);
        } catch { /* log 실패는 무시 */ }
      } finally {
        // 어떤 상황에서도 status를 반드시 완료 상태로 업데이트.
        // 실패 시 error_log에 요약 저장 → 클라이언트가 UI에 표시할 수 있음.
        try {
          await sb.from("pipeline_jobs").update({
            status: failed ? "failed" : "completed",
            completed_at: new Date().toISOString(),
            current_agent: null,
            error_log: failed ? failureMessage : null,
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
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
