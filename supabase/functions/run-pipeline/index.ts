// SPS Pipeline Edge Function v2
// 직원 B→C→F 순차 실행 (백그라운드)
// PR18(ADR-045): agentD(배치 영문 초안 자동 생성) + agentE(배치 스팸 검증) 제거.
//   실제 초안 경로는 Buyers DB → EmailComposeModal → generate-draft (수동). 배치 경로는 사용 안 됨.
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
// ============================================
// Perplexity Search API 헬퍼 (ADR-031)
// ============================================
// 직원 C(agentC)가 바이어별 최근 웹 뉴스·공개 정보를 수집해 Claude 프롬프트 컨텍스트로 주입.
// 크레딧 부족(HTTP 402 또는 본문에 credit/payment 키워드) 감지 시 명시적 failed 로그 → agentF가 경고.
// Teddy 요구(feedback_api_credit_alert): "크레딧 없다고 그냥 패싱되면 안 됨".
type PplxResult = { title: string; url: string; snippet: string };
type PplxResponse =
  | { ok: true; results: PplxResult[] }
  | { ok: false; creditExhausted: boolean; error: string };

async function fetchPerplexitySearch(query: string, apiKey: string): Promise<PplxResponse> {
  try {
    const res = await fetch("https://api.perplexity.ai/search", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, max_results: 3, max_tokens_per_page: 256 }),
    });

    if (res.status === 401) {
      // PR16(ADR-036): 401(키 무효)을 402(크레딧 부족)과 분리.
      //   기존엔 401도 generic !res.ok 경로로 빠져 "크레딧 충전" 안내가 오표시됐음.
      //   인증 실패는 충전이 아닌 키 재확인이 필요 — https://www.perplexity.ai/settings/api
      return {
        ok: false,
        creditExhausted: false,
        error: "Perplexity API 키 무효 (HTTP 401) — https://www.perplexity.ai/settings/api 에서 키 재확인 후 Supabase Secrets `PERPLEXITY_API_KEY` 갱신",
      };
    }
    if (res.status === 402) {
      return { ok: false, creditExhausted: true, error: "Perplexity 크레딧 부족 (HTTP 402) — https://www.perplexity.ai/settings/api 에서 충전 후 재실행" };
    }
    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      const creditLike = /credit|payment|insufficient|billing|quota/i.test(bodyText);
      return {
        ok: false,
        creditExhausted: creditLike,
        error: `Perplexity HTTP ${res.status}${creditLike ? " (크레딧/결제 관련 추정)" : ""}: ${bodyText.slice(0, 200)}`,
      };
    }

    const data = await res.json();
    // Perplexity search API 응답 구조 방어적 파싱 — results 또는 web_results 지원
    const rawResults = Array.isArray(data?.results)
      ? data.results
      : (Array.isArray(data?.web_results) ? data.web_results : []);
    const results: PplxResult[] = rawResults.slice(0, 3).map((r: Record<string, unknown>) => ({
      title: String(r.title || r.heading || ""),
      url: String(r.url || r.link || ""),
      snippet: String(r.snippet || r.excerpt || r.text || r.content || "").slice(0, 600),
    })).filter((r: PplxResult) => r.title.length > 0 || r.snippet.length > 0);
    return { ok: true, results };
  } catch (e) {
    return {
      ok: false,
      creditExhausted: false,
      error: `Perplexity fetch 실패: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

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
      // ADR-029: ±500ms jitter 추가. 3팀 × 배치5 동시 재시도 시 정확히 같은 시각에 재요청하면
      //   429가 연속 발생 → jitter로 분산. Claude API Build Tier 2 자동 승격 전 임시 완충재.
      const jitterMs = Math.floor(Math.random() * 1000) - 500; // -500 ~ +500
      const delayMs = Math.max(100, (headerDelayMs > 0 ? headerDelayMs : defaultDelays[attempt]) + jitterMs);
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

  // ADR-031: PR12 rubric 완화. 이전 "1개라도 0점 → 전체 0점"은 Perplexity 외부 자료 기반
  //   분석에서 정직하게 "정보 부족"으로 남긴 필드를 불합격 처리 → intel_score 양극화 주범.
  //   완화: "2개 이상 0점이면 전체 0점" — 1개 필드 빈약은 허용, 2개 이상 부족은 신뢰도 부족으로 탈락.
  const zeroCount = [csScore, kiScore, fmScore, paScore].filter((s) => s === 0).length;
  if (zeroCount >= 2) return 0;

  return csScore + kiScore + fmScore + paScore;
}

async function agentC(sb: SB, jobId: string, _team: string) {
  await log(sb, jobId, "C", "running", "직원C 시작: 기업 분석");

  const API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!API_KEY) { await log(sb, jobId, "C", "failed", "ANTHROPIC_API_KEY 없음"); return; }

  // ADR-031 PR12: Perplexity 웹 검색 API 도입. 키 미설정 시 기존 Claude-only 폴백.
  const PPLX_KEY = Deno.env.get("PERPLEXITY_API_KEY");
  if (!PPLX_KEY) {
    await log(sb, jobId, "C", "running",
      "PERPLEXITY_API_KEY 미설정 — 웹 검색 없이 Claude 학습 데이터만으로 분석 (인텔 품질 저하 가능).");
  }
  let perplexityCreditExhausted = false; // 한 번 크레딧 부족 감지 시 이후 바이어는 Claude-only 폴백

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
  // PR12: Perplexity 사용량 통계
  let pplxSuccessCount = 0;
  let pplxFailCount = 0;

  // ADR-031: Perplexity 검색 호출. 크레딧 부족 감지 시 이후 모든 바이어는 Claude-only 폴백.
  async function callPerplexityForBuyer(b: Record<string, unknown>): Promise<PplxResult[] | null> {
    if (!PPLX_KEY || perplexityCreditExhausted) return null;
    const company = String(b.company_name || "");
    const region = String(b.region || "");
    const domain = String(b.domain || b.website || "");
    // 쿼리 전략: 회사명 + 지역 + 최근 활동 키워드. 도메인이 있으면 보조 신호로 활용.
    const query = domain
      ? `"${company}" ${region} cosmetics beauty brand recent news products launches partnerships (${domain})`
      : `"${company}" ${region} cosmetics beauty brand recent news products launches partnerships 2025 2026`;
    const result = await fetchPerplexitySearch(query, PPLX_KEY!);
    if (!result.ok) {
      pplxFailCount++;
      if (result.creditExhausted) {
        // Teddy 요구(feedback_api_credit_alert): 조용히 패싱 금지. failed 로그 + 이후 전체 폴백.
        perplexityCreditExhausted = true;
        await log(sb, jobId, "C", "failed",
          `Perplexity 크레딧 부족 — https://www.perplexity.ai/settings/api 에서 충전 후 재실행. 이후 바이어는 Claude-only 폴백.`);
      } else {
        // 네트워크·쿼리 오류 등 일시 장애 — 해당 바이어만 Claude-only 폴백, 경고 로그
        await log(sb, jobId, "C", "running",
          `Perplexity 오류 (${company}): ${result.error.slice(0, 150)} — Claude-only 폴백`);
      }
      return null;
    }
    pplxSuccessCount++;
    return result.results;
  }

  // Claude 기업 분석 호출 — 1차/재시도 + Perplexity 외부 자료 주입
  async function callClaudeIntel(
    b: Record<string, unknown>,
    retryMode: boolean,
    pplxResults: PplxResult[] | null,
  ): Promise<{ json: Record<string, unknown> | null; cost: number; httpError?: string; rateLimited?: boolean }> {
    const retryHint = retryMode
      ? `\n\n[재시도] 이전 응답이 품질 기준(각 필드 구체성) 미달이었습니다. 외부 자료가 있으면 더 적극적으로 인용하고, 없는 필드는 "외부 자료 부족 — 향후 직접 리서치 필요"로 명시.`
      : "";

    // 외부 자료가 있으면 Claude가 팩트 기반으로 작성하게 하고, 없는 내용 창작 금지.
    const externalSection = pplxResults && pplxResults.length > 0
      ? `=== 외부 자료 (Perplexity 웹 검색 결과) ===
${pplxResults.map((r, i) => `[${i + 1}] ${r.title}
  출처: ${r.url}
  내용: ${r.snippet}`).join("\n\n")}
=== 외부 자료 끝 ===

**중요 지시 (외부 자료 기반 분석):**
1. company_status의 모든 구체 사실은 반드시 위 외부 자료 [1]/[2]/[3] 중 하나에서 인용하세요. "Aurora의 두바이몰 입점 [1]" 같이 출처 번호를 문장 끝에 병기.
2. 외부 자료에 없는 정보는 절대 창작·추측 금지. 해당 필드가 빈약하면 "외부 자료 부족 — 향후 직접 리서치 필요"로 정직하게 남기세요.
3. 학습 데이터 기반 일반론(예: "이 기업은 성장 중으로 보입니다")을 외부 자료와 섞지 말 것. 오직 외부 자료만 사실 근거로 사용.

`
      : `**중요 지시 (외부 자료 없음):**
- Perplexity 웹 검색이 제공되지 않았습니다. Claude 학습 데이터 기반 추론만 가능합니다.
- 확실하지 않은 내용은 "정보 부족"으로 정직하게 남기세요. 구체 브랜드·제품명 환각 금지.

`;

    const prompt = `당신은 한국 OEM/ODM 화장품 제조사 SPS Cosmetics(spscos.com)의 B2B 애널리스트입니다.

${externalSection}기업명: ${b.company_name}
도메인: ${b.domain || b.website}
지역: ${b.region} | Tier: ${b.tier} | 매출: $${b.annual_revenue || "미상"}
직원 수: ${b.employee_count || "미상"} | 채용 공고: ${b.open_jobs_signal ? "있음" : "없음"}

모든 필드 값을 **한국어로** 작성하세요. JSON 형식으로만 응답 (마크다운 금지):
{
  "company_status": "최근 제품·캠페인·파트너십 등 기업 현황 1~2문장. 외부 자료 인용 시 문장 끝에 [1]/[2]/[3] 출처 번호 병기. 정보 없으면 '외부 자료 부족 — 향후 직접 리서치 필요'.",
  "kbeauty_interest": "한국 화장품 브랜드 이력 및 K-beauty 관심도 — 낮음/중간/높음 중 하나 + 판단 근거 (외부 자료에 Korean brand 언급 있으면 인용, 없으면 '낮음 (외부 자료 기반 증거 없음)').",
  "recommended_formula": "SPS 카테고리 매칭 — 스킨케어/바디케어/컬러/헤어케어/프래그런스 중 2~4개 카테고리 (외부 자료에 제품 라인 단서 있으면 그 방향으로 추천. 한국어 쉼표 구분.).",
  "proposal_angle": "이 기업에 접근할 한 줄 영업 제안 각도 — 외부 자료의 구체 사실(확장·파트너십·최근 론칭)을 근거로 삼을 것. 자료 없으면 '추가 리서치 후 제안 각도 설정 필요'."
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
        // ADR-031: 바이어별 Perplexity 웹 검색 1회 → 1차/재시도 Claude 호출에 동일 자료 재사용.
        //   크레딧 부족·네트워크 장애 시 null 반환 → Claude-only 폴백(프롬프트가 "외부 자료 없음" 분기 자동 사용).
        const pplxResults = await callPerplexityForBuyer(b);

        // 1차 호출
        const first = await callClaudeIntel(b, false, pplxResults);
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
          const retry = await callClaudeIntel(b, true, pplxResults);
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
          // 합격 — recent_news + intel_score 저장.
          // PR16(ADR-037): race condition 복구. 3팀 동시 실행 중 한 job이 먼저 1차 score<60으로
          //   status='intel_failed' 마킹했더라도, 다른 job이 후행 score=100을 얻으면 status를
          //   'Cold'로 reset해 모순 상태(점수 100 + intel_failed)를 제거.
          //   analysis_failed_at도 함께 비워 재분석 게이트에서 제외되지 않도록 함.
          await sb.from("buyers")
            .update({
              recent_news: finalJson,
              intel_score: score,
              status: "Cold",
              analysis_failed_at: null,
            })
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

  // PR12: Perplexity 사용 통계 추가 로그
  const pplxStat = PPLX_KEY
    ? ` · Perplexity 성공 ${pplxSuccessCount}/실패 ${pplxFailCount}${perplexityCreditExhausted ? " (크레딧 소진)" : ""}`
    : " · Perplexity 미사용(키 없음)";
  await log(sb, jobId, "C", "completed",
    `직원C 완료: 합격 ${analyzed} · 재시도 ${retriedCount} · 불합격(intel_failed) ${intelFailedCount}${pplxStat}, API $${totalCost.toFixed(4)}`,
    0, totalCost);
}


// ============================================
// 직원 F: 파이프라인 검증 + 시스템 모니터링
// ============================================
// 이 job의 B~C 로그를 전부 스캔해서 실제 오류/누락을 구체 경고로 기록.
// 웹앱 파서 호환을 위해 경고 포맷은 "경고 N건: msg1 | msg2" 유지.
async function agentF(sb: SB, jobId: string, _team: string) {
  await log(sb, jobId, "F", "running", "직원F 시작: 파이프라인 검증");

  const warnings: string[] = [];

  // === 1. 이번 job의 B~C 로그 전체 스캔 ===
  const { data: jobLogs } = await sb.from("pipeline_logs")
    .select("agent, status, message")
    .eq("job_id", jobId)
    .in("agent", ["B", "C"]);

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
  for (const agent of ["B", "C"]) {
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

  // PR18(ADR-045): 직원D/E 배치 경로 제거로 email_drafts 생성 건수 체크 삭제.
  //   수동 경로(EmailComposeModal)로만 초안 생성되므로 파이프라인 실행 결과 지표가 아님.

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
