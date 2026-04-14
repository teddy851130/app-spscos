// SPS KPI 스냅샷 자동 누적 Edge Function
// 오늘 날짜 기준으로 GCC/USA/Europe 3개 리전의 KPI를 계산하여 kpi_snapshots에 UPSERT
//
// 입력 (POST): 별도 body 불필요 (오늘 날짜 자동 사용)
// 출력 성공: { success: true, message: "...", data: [...] }
// 출력 실패: { success: false, error: "..." }
//
// 계산 대상:
//   - emails_sent: email_logs에서 오늘 발송된 건수 (buyer → region 조인)
//   - emails_replied: buyers에서 오늘 Replied로 전환된 건수
//   - emails_bounced: email_logs에서 오늘 바운스된 건수
//   - new_leads: buyers에서 오늘 생성된 건수
//   - open_rate: 0 (추적 미구현)
//   - reply_rate / bounce_rate: 발송 대비 비율
//   - spam_rate: 0 (측정 불가)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// --- 공통 유틸 (send-email과 동일 패턴) ---

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getSupabase() {
  const serviceKey =
    Deno.env.get("SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(Deno.env.get("SUPABASE_URL")!, serviceKey!);
}

// --- 리전 목록 ---
const REGIONS = ["GCC", "USA", "Europe"] as const;
type Region = (typeof REGIONS)[number];

// --- 오늘 날짜 범위 (UTC 기준) ---
function getTodayRange(): { start: string; end: string; dateStr: string } {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
  return {
    start: `${dateStr}T00:00:00.000Z`,
    end: `${dateStr}T23:59:59.999Z`,
    dateStr,
  };
}

// --- 리전별 KPI 계산 ---
async function calcRegionKpi(
  sb: ReturnType<typeof getSupabase>,
  region: Region,
  start: string,
  end: string,
) {
  // 1) emails_sent: email_logs.status='sent', sent_at이 오늘, buyer의 region 매칭
  //    email_logs에는 region이 없으므로 buyer_id로 buyers 테이블 조인 필요
  //    Supabase JS에서는 foreign key 관계를 통해 필터링 가능
  const { count: emailsSent, error: sentErr } = await sb
    .from("email_logs")
    .select("id", { count: "exact", head: true })
    .eq("status", "sent")
    .gte("sent_at", start)
    .lte("sent_at", end)
    .not("buyer_id", "is", null)
    // buyer_id를 통한 리전 필터 — inner join 방식으로 처리
    .in(
      "buyer_id",
      // 서브쿼리: 해당 리전의 buyer id 목록
      await getBuyerIdsByRegion(sb, region),
    );

  if (sentErr) {
    console.error(`[snapshot-kpi] emails_sent 조회 실패 (${region}):`, sentErr.message);
  }

  // 2) emails_bounced: email_logs.status='bounced', sent_at이 오늘
  const { count: emailsBounced, error: bouncedErr } = await sb
    .from("email_logs")
    .select("id", { count: "exact", head: true })
    .eq("status", "bounced")
    .gte("sent_at", start)
    .lte("sent_at", end)
    .not("buyer_id", "is", null)
    .in("buyer_id", await getBuyerIdsByRegion(sb, region));

  if (bouncedErr) {
    console.error(`[snapshot-kpi] emails_bounced 조회 실패 (${region}):`, bouncedErr.message);
  }

  // 3) emails_replied: buyers.status='Replied' AND updated_at이 오늘
  const { count: emailsReplied, error: repliedErr } = await sb
    .from("buyers")
    .select("id", { count: "exact", head: true })
    .eq("region", region)
    .eq("status", "Replied")
    .gte("updated_at", start)
    .lte("updated_at", end);

  if (repliedErr) {
    console.error(`[snapshot-kpi] emails_replied 조회 실패 (${region}):`, repliedErr.message);
  }

  // 4) new_leads: buyers.created_at이 오늘
  const { count: newLeads, error: leadsErr } = await sb
    .from("buyers")
    .select("id", { count: "exact", head: true })
    .eq("region", region)
    .gte("created_at", start)
    .lte("created_at", end);

  if (leadsErr) {
    console.error(`[snapshot-kpi] new_leads 조회 실패 (${region}):`, leadsErr.message);
  }

  const sent = emailsSent ?? 0;
  const replied = emailsReplied ?? 0;
  const bounced = emailsBounced ?? 0;
  const leads = newLeads ?? 0;

  // 비율 계산 — 소수점 둘째 자리까지
  const replyRate = sent > 0 ? Math.round((replied / sent) * 10000) / 100 : 0;
  const bounceRate = sent > 0 ? Math.round((bounced / sent) * 10000) / 100 : 0;

  return {
    emails_sent: sent,
    emails_opened: 0, // TODO: 오픈 추적 구현 후 활성화
    emails_replied: replied,
    emails_bounced: bounced,
    open_rate: 0, // TODO: 오픈 추적 구현 후 활성화
    reply_rate: replyRate,
    bounce_rate: bounceRate,
    spam_rate: 0, // TODO: 스팸 측정 불가
    new_leads: leads,
  };
}

// --- 리전별 buyer ID 목록 조회 (캐시용) ---
const buyerIdCache = new Map<string, string[]>();

async function getBuyerIdsByRegion(
  sb: ReturnType<typeof getSupabase>,
  region: Region,
): Promise<string[]> {
  // 같은 요청 내에서 중복 조회 방지
  if (buyerIdCache.has(region)) {
    return buyerIdCache.get(region)!;
  }

  const { data, error } = await sb
    .from("buyers")
    .select("id")
    .eq("region", region);

  if (error) {
    console.error(`[snapshot-kpi] buyer ID 조회 실패 (${region}):`, error.message);
    return [];
  }

  const ids = (data ?? []).map((b: { id: string }) => b.id);
  buyerIdCache.set(region, ids);
  return ids;
}

// --- 메인 핸들러 ---
Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "POST 메서드만 허용" }, 405);
  }

  try {
    const sb = getSupabase();
    const { start, end, dateStr } = getTodayRange();

    console.log(`[snapshot-kpi] 스냅샷 시작: ${dateStr}`);

    // 캐시 초기화 (매 요청마다)
    buyerIdCache.clear();

    // 3개 리전 병렬 계산
    const results = await Promise.all(
      REGIONS.map(async (region) => {
        const kpi = await calcRegionKpi(sb, region, start, end);
        return {
          snapshot_date: dateStr,
          region,
          ...kpi,
        };
      }),
    );

    // UPSERT — snapshot_date + region 유니크 제약 활용
    const { data, error } = await sb
      .from("kpi_snapshots")
      .upsert(results, { onConflict: "snapshot_date,region" })
      .select();

    if (error) {
      console.error(`[snapshot-kpi] UPSERT 실패:`, error.message);
      return jsonResponse(
        { success: false, error: `KPI UPSERT 실패: ${error.message}` },
        500,
      );
    }

    console.log(`[snapshot-kpi] 스냅샷 완료: ${dateStr}, ${results.length}건 저장`);

    return jsonResponse(
      {
        success: true,
        message: `${dateStr} KPI 스냅샷 ${results.length}건 저장 완료`,
        data,
      },
      200,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[snapshot-kpi] 예상치 못한 에러:`, msg);
    return jsonResponse(
      { success: false, error: `서버 에러: ${msg}` },
      500,
    );
  }
});
