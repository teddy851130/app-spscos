// SPS Pipeline Edge Function
// 직원 A→B→C→D→E 순차 실행 (백그라운드)
// 브라우저를 닫아도 Supabase에서 독립적으로 실행됨

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ============================================
// Supabase Client (service_role for backend)
// ============================================
function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

// ============================================
// 로그 기록 헬퍼
// ============================================
async function log(
  supabase: ReturnType<typeof createClient>,
  jobId: string,
  agent: string,
  status: string,
  message: string,
  creditsUsed = 0,
  apiCostUsd = 0
) {
  await supabase.from("pipeline_logs").insert({
    job_id: jobId,
    agent,
    status,
    message,
    credits_used: creditsUsed,
    api_cost_usd: apiCostUsd,
  });
}

// ============================================
// 직원 A: Clay API - 바이어 발굴
// ============================================
async function agentA(
  supabase: ReturnType<typeof createClient>,
  jobId: string,
  team: string
) {
  await log(supabase, jobId, "A", "running", `직원A 시작: ${team}팀 바이어 발굴`);

  const CLAY_API_KEY = Deno.env.get("CLAY_API_KEY");
  if (!CLAY_API_KEY) {
    await log(supabase, jobId, "A", "failed", "CLAY_API_KEY 환경변수 없음");
    return;
  }

  // 팀별 검색 조건
  const teamConfig: Record<string, { countries: string[]; industries: string[] }> = {
    GCC: {
      countries: ["United Arab Emirates", "Saudi Arabia", "Kuwait"],
      industries: ["beauty", "cosmetics", "retail"],
    },
    USA: {
      countries: ["United States", "Canada"],
      industries: ["beauty", "personal care", "e-commerce"],
    },
    Europe: {
      countries: ["United Kingdom", "France", "Germany"],
      industries: ["beauty", "FMCG", "lifestyle"],
    },
  };

  const config = teamConfig[team];
  if (!config) {
    await log(supabase, jobId, "A", "failed", `알 수 없는 팀: ${team}`);
    return;
  }

  // 기존 도메인 조회 (중복 제거용)
  const { data: existingBuyers } = await supabase
    .from("buyers")
    .select("domain")
    .eq("team", team)
    .not("domain", "is", null);

  const existingDomains = new Set(
    (existingBuyers || []).map((b: { domain: string }) => b.domain?.toLowerCase())
  );

  // 블랙리스트 도메인 조회
  const { data: blacklisted } = await supabase
    .from("buyers")
    .select("domain")
    .eq("is_blacklisted", true);

  const blacklistDomains = new Set(
    (blacklisted || []).map((b: { domain: string }) => b.domain?.toLowerCase())
  );

  let totalCreditsUsed = 0;
  let companiesFound = 0;
  let contactsFound = 0;

  try {
    // Clay API: find-and-enrich-company
    for (const country of config.countries) {
      for (const industry of config.industries) {
        // 일일 크레딧 한도 체크 (90/일)
        if (totalCreditsUsed >= 85) {
          await log(supabase, jobId, "A", "running", `일일 크레딧 한도 근접 (${totalCreditsUsed}), 중단`);
          break;
        }

        // Clay API 호출 - 기업 탐색
        const searchResponse = await fetch("https://api.clay.com/v3/sources/search", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${CLAY_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: `${industry} companies in ${country}`,
            filters: {
              min_employees: 50,
              industries: [industry],
              countries: [country],
            },
            limit: 10,
          }),
        });

        if (!searchResponse.ok) {
          const errorText = await searchResponse.text();
          await log(supabase, jobId, "A", "running",
            `Clay 검색 실패 (${country}/${industry}): ${searchResponse.status} - ${errorText}`);
          continue;
        }

        const searchData = await searchResponse.json();
        const companies = searchData.results || searchData.data || [];
        totalCreditsUsed += 2; // 검색 크레딧

        for (const company of companies) {
          const domain = (company.domain || company.website || "")
            .replace(/^https?:\/\//, "")
            .replace(/\/.*$/, "")
            .toLowerCase();

          if (!domain || existingDomains.has(domain) || blacklistDomains.has(domain)) {
            continue;
          }

          // Clay Enrichment: Annual Revenue + Open Jobs (2 크레딧)
          let annualRevenue = company.annual_revenue || company.estimated_annual_revenue || 0;
          let openJobsSignal = false;

          try {
            const enrichResponse = await fetch("https://api.clay.com/v3/sources/enrich", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${CLAY_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                domain: domain,
                enrichments: ["annual_revenue", "open_jobs"],
              }),
            });

            if (enrichResponse.ok) {
              const enrichData = await enrichResponse.json();
              annualRevenue = enrichData.annual_revenue || annualRevenue;
              openJobsSignal = (enrichData.open_jobs_count || 0) > 0;
              totalCreditsUsed += 2;
            }
          } catch {
            // enrichment 실패 시 기본값 사용
          }

          // Tier 분류
          const revenue = typeof annualRevenue === "number" ? annualRevenue : parseFloat(String(annualRevenue)) || 0;
          let tier: string;
          if (revenue >= 50_000_000) {
            tier = "Tier1";
          } else if (revenue >= 5_000_000) {
            tier = "Tier2";
          } else {
            tier = "Tier3";
          }

          // 바이어 DB에 INSERT
          const { data: newBuyer } = await supabase
            .from("buyers")
            .insert({
              company_name: company.name || company.company_name || domain,
              domain,
              website: company.website || `https://${domain}`,
              region: team,
              team,
              tier,
              annual_revenue: revenue,
              open_jobs_signal: openJobsSignal,
              employee_count: company.employee_count || company.num_employees,
              is_blacklisted: false,
              job_id: jobId,
              status: "Cold",
              k_beauty_flag: "Unknown",
            })
            .select("id, tier")
            .single();

          if (!newBuyer) continue;

          existingDomains.add(domain);
          companiesFound++;

          // Tier3 → 저장 후 담당자 탐색 안함
          if (tier === "Tier3") continue;

          // Tier1/2 → 담당자 탐색
          const titleKeywords = [
            "Buying", "Procurement", "Beauty", "NPD",
            "Sourcing", "Product Development",
          ];
          const seniorityLevels = tier === "Tier1"
            ? ["Manager", "Senior Manager", "Director", "VP"]
            : ["Manager", "Senior Manager", "Director"];

          try {
            const contactResponse = await fetch(
              "https://api.clay.com/v3/sources/find-contacts",
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${CLAY_API_KEY}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  domain: domain,
                  title_keywords: titleKeywords,
                  seniority_levels: seniorityLevels,
                  min_tenure_months: 6,
                  limit: 1, // 기업당 1명
                }),
              }
            );

            if (contactResponse.ok) {
              const contactData = await contactResponse.json();
              const contacts = contactData.results || contactData.data || [];
              totalCreditsUsed += 1;

              if (contacts.length > 0) {
                const contact = contacts[0];

                // Email enrichment (1 크레딧/명)
                let contactEmail = contact.email || "";
                if (!contactEmail && contact.linkedin_url) {
                  try {
                    const emailRes = await fetch(
                      "https://api.clay.com/v3/sources/enrich-email",
                      {
                        method: "POST",
                        headers: {
                          Authorization: `Bearer ${CLAY_API_KEY}`,
                          "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                          linkedin_url: contact.linkedin_url,
                        }),
                      }
                    );
                    if (emailRes.ok) {
                      const emailData = await emailRes.json();
                      contactEmail = emailData.email || "";
                      totalCreditsUsed += 1;
                    }
                  } catch {
                    // email enrichment 실패
                  }
                }

                // buyer_contacts에 INSERT
                await supabase.from("buyer_contacts").insert({
                  buyer_id: newBuyer.id,
                  contact_name: contact.name || contact.full_name || "",
                  contact_title: contact.title || contact.job_title || "",
                  contact_email: contactEmail,
                  linkedin_url: contact.linkedin_url || "",
                  work_history_summary: contact.work_history_summary || "",
                  is_primary: true,
                  source: "clay",
                });

                contactsFound++;

                // buyers 테이블에도 primary contact 정보 업데이트
                await supabase
                  .from("buyers")
                  .update({
                    contact_name: contact.name || contact.full_name,
                    contact_title: contact.title || contact.job_title,
                    contact_email: contactEmail,
                    linkedin_url: contact.linkedin_url,
                  })
                  .eq("id", newBuyer.id);
              }
            }
          } catch {
            // 담당자 탐색 실패 시 계속 진행
          }

          // Tier1 기업만 Recent News 추가 (1 크레딧/기업)
          if (tier === "Tier1") {
            try {
              const newsRes = await fetch("https://api.clay.com/v3/sources/enrich", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${CLAY_API_KEY}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  domain: domain,
                  enrichments: ["recent_news"],
                }),
              });

              if (newsRes.ok) {
                const newsData = await newsRes.json();
                if (newsData.recent_news) {
                  await supabase
                    .from("buyers")
                    .update({ recent_news: newsData.recent_news })
                    .eq("id", newBuyer.id);
                }
                totalCreditsUsed += 1;
              }
            } catch {
              // news enrichment 실패
            }
          }
        }
      }
    }
  } catch (error) {
    await log(supabase, jobId, "A", "failed",
      `직원A 오류: ${error instanceof Error ? error.message : String(error)}`,
      totalCreditsUsed);
    return;
  }

  await log(supabase, jobId, "A", "completed",
    `직원A 완료: 기업 ${companiesFound}개, 담당자 ${contactsFound}명 발굴 (크레딧 ${totalCreditsUsed} 사용)`,
    totalCreditsUsed);
}

// ============================================
// 직원 B: ZeroBounce API - 이메일 유효성 검증
// ============================================
async function agentB(
  supabase: ReturnType<typeof createClient>,
  jobId: string,
  _team: string
) {
  await log(supabase, jobId, "B", "running", "직원B 시작: 이메일 유효성 검증");

  const ZEROBOUNCE_API_KEY = Deno.env.get("ZEROBOUNCE_API_KEY");
  if (!ZEROBOUNCE_API_KEY) {
    await log(supabase, jobId, "B", "failed", "ZEROBOUNCE_API_KEY 환경변수 없음");
    return;
  }

  // email_status가 null인 buyer_contacts 조회
  const { data: contacts } = await supabase
    .from("buyer_contacts")
    .select("id, contact_email, buyer_id")
    .is("email_status", null)
    .not("contact_email", "is", null)
    .not("contact_email", "eq", "");

  if (!contacts || contacts.length === 0) {
    await log(supabase, jobId, "B", "completed", "검증할 이메일 없음");
    return;
  }

  // buyer_id → tier 매핑
  const buyerIds = [...new Set(contacts.map((c: { buyer_id: string }) => c.buyer_id))];
  const { data: buyers } = await supabase
    .from("buyers")
    .select("id, tier")
    .in("id", buyerIds);

  const buyerTierMap = new Map(
    (buyers || []).map((b: { id: string; tier: string }) => [b.id, b.tier])
  );

  let validated = 0;
  let valid = 0;
  let invalid = 0;
  let excluded = 0;

  for (const contact of contacts) {
    try {
      const response = await fetch(
        `https://api.zerobounce.net/v2/validate?api_key=${ZEROBOUNCE_API_KEY}&email=${encodeURIComponent(contact.contact_email)}`
      );

      if (!response.ok) continue;

      const result = await response.json();
      const zbStatus = (result.status || "").toLowerCase();
      const tier = buyerTierMap.get(contact.buyer_id) || "Tier2";

      let emailStatus: string;
      let shouldBlacklist = false;

      if (zbStatus === "valid") {
        emailStatus = "valid";
        valid++;
      } else if (zbStatus === "invalid") {
        emailStatus = "invalid";
        shouldBlacklist = true;
        invalid++;
      } else if (zbStatus === "catch-all") {
        emailStatus = "catch-all";
        if (tier !== "Tier1") {
          shouldBlacklist = true; // Tier2 catch-all → 제외
          excluded++;
        } else {
          valid++; // Tier1 catch-all → 통과
        }
      } else {
        // risky, unknown → 제외
        emailStatus = zbStatus === "do_not_mail" ? "risky" : "unknown";
        shouldBlacklist = true;
        excluded++;
      }

      // buyer_contacts 업데이트
      await supabase
        .from("buyer_contacts")
        .update({ email_status: emailStatus })
        .eq("id", contact.id);

      // 블랙리스트 처리
      if (shouldBlacklist) {
        await supabase
          .from("buyers")
          .update({ is_blacklisted: true })
          .eq("id", contact.buyer_id);
      }

      validated++;
    } catch {
      // 개별 검증 실패 시 계속 진행
    }
  }

  await log(supabase, jobId, "B", "completed",
    `직원B 완료: ${validated}건 검증 (valid: ${valid}, invalid: ${invalid}, 제외: ${excluded})`);
}

// ============================================
// 직원 C: Claude API + web_search - 기업 분석
// ============================================
async function agentC(
  supabase: ReturnType<typeof createClient>,
  jobId: string,
  _team: string
) {
  await log(supabase, jobId, "C", "running", "직원C 시작: 기업 분석");

  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) {
    await log(supabase, jobId, "C", "failed", "ANTHROPIC_API_KEY 환경변수 없음");
    return;
  }

  // valid 또는 catch-all(Tier1) 이메일의 기업만 조회
  const { data: validContacts } = await supabase
    .from("buyer_contacts")
    .select("buyer_id")
    .in("email_status", ["valid", "catch-all"]);

  if (!validContacts || validContacts.length === 0) {
    await log(supabase, jobId, "C", "completed", "분석할 기업 없음");
    return;
  }

  const validBuyerIds = [...new Set(validContacts.map((c: { buyer_id: string }) => c.buyer_id))];

  const { data: buyers } = await supabase
    .from("buyers")
    .select("*")
    .in("id", validBuyerIds)
    .eq("is_blacklisted", false)
    .is("recent_news", null); // 아직 분석 안된 기업만

  if (!buyers || buyers.length === 0) {
    await log(supabase, jobId, "C", "completed", "분석할 새 기업 없음");
    return;
  }

  let analyzed = 0;
  let totalCost = 0;

  for (const buyer of buyers) {
    try {
      const prompt = `You are a B2B sales analyst for SPS Cosmetics (spscos.com), a Korean cosmetics OEM/ODM manufacturer.

Analyze this potential buyer company and provide a JSON response:

Company: ${buyer.company_name}
Domain: ${buyer.domain || buyer.website}
Region: ${buyer.region}
Tier: ${buyer.tier}
Annual Revenue: $${buyer.annual_revenue || "Unknown"}
Employee Count: ${buyer.employee_count || "Unknown"}

Provide analysis in this exact JSON format:
{
  "company_summary": "2-3 sentence summary of the company, their market position, and product focus",
  "kbeauty_interest": "low/medium/high - their likely interest in K-beauty products based on their portfolio",
  "recommended_formulas": ["list of 3-5 spscos.com product categories that match their needs, e.g. skincare serums, sheet masks, lip products"],
  "pitch_angle": "1-2 sentence recommended sales approach angle specific to this company",
  "analysis_date": "${new Date().toISOString().split("T")[0]}"
}

Be specific and actionable. Use the company data provided - minimize speculation.`;

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 500,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        await log(supabase, jobId, "C", "running",
          `Claude API 실패 (${buyer.company_name}): ${response.status} - ${errText}`);
        continue;
      }

      const result = await response.json();
      const text = result.content?.[0]?.text || "";

      // 비용 계산 (Haiku: input $0.80/MTok, output $4/MTok)
      const inputTokens = result.usage?.input_tokens || 0;
      const outputTokens = result.usage?.output_tokens || 0;
      const cost = (inputTokens * 0.0000008) + (outputTokens * 0.000004);
      totalCost += cost;

      // JSON 파싱
      let analysisJson;
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        analysisJson = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: text };
      } catch {
        analysisJson = { raw: text };
      }

      // buyers.recent_news에 JSON으로 업데이트
      await supabase
        .from("buyers")
        .update({ recent_news: analysisJson })
        .eq("id", buyer.id);

      analyzed++;
    } catch {
      // 개별 분석 실패 시 계속
    }
  }

  await log(supabase, jobId, "C", "completed",
    `직원C 완료: ${analyzed}개 기업 분석 (API 비용: $${totalCost.toFixed(4)})`,
    0, totalCost);
}

// ============================================
// 직원 D: Claude API - 이메일 초안 작성
// ============================================
async function agentD(
  supabase: ReturnType<typeof createClient>,
  jobId: string,
  _team: string
) {
  await log(supabase, jobId, "D", "running", "직원D 시작: 이메일 초안 작성");

  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) {
    await log(supabase, jobId, "D", "failed", "ANTHROPIC_API_KEY 환경변수 없음");
    return;
  }

  // valid/catch-all 담당자 + 기업 정보 JOIN
  const { data: contacts } = await supabase
    .from("buyer_contacts")
    .select("id, buyer_id, contact_name, contact_title, contact_email, email_status")
    .in("email_status", ["valid", "catch-all"]);

  if (!contacts || contacts.length === 0) {
    await log(supabase, jobId, "D", "completed", "이메일 작성할 담당자 없음");
    return;
  }

  // 이미 초안이 있는 contact 제외
  const { data: existingDrafts } = await supabase
    .from("email_drafts")
    .select("buyer_contact_id");

  const existingContactIds = new Set(
    (existingDrafts || []).map((d: { buyer_contact_id: string }) => d.buyer_contact_id)
  );

  const newContacts = contacts.filter(
    (c: { id: string }) => !existingContactIds.has(c.id)
  );

  if (newContacts.length === 0) {
    await log(supabase, jobId, "D", "completed", "새 이메일 초안 작성 대상 없음");
    return;
  }

  // buyer 정보 조회
  const buyerIds = [...new Set(newContacts.map((c: { buyer_id: string }) => c.buyer_id))];
  const { data: buyers } = await supabase
    .from("buyers")
    .select("*")
    .in("id", buyerIds)
    .eq("is_blacklisted", false);

  const buyerMap = new Map(
    (buyers || []).map((b: { id: string }) => [b.id, b])
  );

  let drafted = 0;
  let totalCost = 0;

  for (const contact of newContacts) {
    const buyer = buyerMap.get(contact.buyer_id) as Record<string, unknown> | undefined;
    if (!buyer) continue;

    const tier = buyer.tier as string;
    const analysis = buyer.recent_news as Record<string, unknown> | null;

    try {
      const tierAngle = tier === "Tier1"
        ? "Partnership angle - position SPS as a strategic K-beauty OEM/ODM partner for their premium portfolio"
        : "Test order angle - low-risk trial with 3,000 unit MOQ to test K-beauty products in their market";

      const followupDays = tier === "Tier1" ? 5 : 7;

      const prompt = `You are writing B2B cold emails for SPS Cosmetics (spscos.com), a Korean cosmetics OEM/ODM manufacturer.
CEO: Teddy Shin (teddy@spscos.com)
MOQ: 3,000 units minimum

Target Contact:
- Name: ${contact.contact_name}
- Title: ${contact.contact_title}
- Company: ${buyer.company_name}
- Region: ${buyer.region}
- Tier: ${tier}

Company Analysis:
${analysis ? JSON.stringify(analysis) : "No analysis available"}

Sales Angle: ${tierAngle}

Generate a JSON response with:
{
  "subject_line_1": "Subject line option 1 (curiosity-based)",
  "subject_line_2": "Subject line option 2 (value-based)",
  "subject_line_3": "Subject line option 3 (personalized)",
  "body_first": "First cold email (120-150 words). Structure: Opening hook → Relevance to their business → SPS value proposition → Clear CTA (meeting/call). Professional but warm tone. No spam words.",
  "body_followup": "Follow-up email (80-100 words, sent ${followupDays} days later). Reference first email briefly → New angle or social proof → Soft CTA. Don't be pushy."
}

Rules:
- No spam trigger words (free, guaranteed, act now, limited time)
- Max 2 links to spscos.com
- Max 1 external link
- Address by first name
- Sign off as Teddy Shin, CEO, SPS Cosmetics`;

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 800,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!response.ok) continue;

      const result = await response.json();
      const text = result.content?.[0]?.text || "";

      const inputTokens = result.usage?.input_tokens || 0;
      const outputTokens = result.usage?.output_tokens || 0;
      const cost = (inputTokens * 0.0000008) + (outputTokens * 0.000004);
      totalCost += cost;

      let emailJson;
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        emailJson = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      } catch {
        emailJson = null;
      }

      if (!emailJson) continue;

      // email_drafts에 INSERT
      await supabase.from("email_drafts").insert({
        buyer_contact_id: contact.id,
        subject_line_1: emailJson.subject_line_1 || "",
        subject_line_2: emailJson.subject_line_2 || "",
        subject_line_3: emailJson.subject_line_3 || "",
        body_first: emailJson.body_first || "",
        body_followup: emailJson.body_followup || "",
        tier,
      });

      drafted++;
    } catch {
      // 개별 실패 시 계속
    }
  }

  await log(supabase, jobId, "D", "completed",
    `직원D 완료: ${drafted}개 이메일 초안 작성 (API 비용: $${totalCost.toFixed(4)})`,
    0, totalCost);
}

// ============================================
// 직원 E: GlockApps API - 스팸 검토
// ============================================
async function agentE(
  supabase: ReturnType<typeof createClient>,
  jobId: string,
  _team: string
) {
  await log(supabase, jobId, "E", "running", "직원E 시작: 스팸 검토");

  const GLOCKAPP_API_KEY = Deno.env.get("GLOCKAPP_API_KEY");
  if (!GLOCKAPP_API_KEY) {
    await log(supabase, jobId, "E", "failed", "GLOCKAPP_API_KEY 환경변수 없음");
    return;
  }

  // spam_status가 null인 email_drafts 조회
  const { data: drafts } = await supabase
    .from("email_drafts")
    .select("id, subject_line_1, body_first, body_followup")
    .is("spam_status", null);

  if (!drafts || drafts.length === 0) {
    await log(supabase, jobId, "E", "completed", "스팸 검토할 이메일 없음");
    return;
  }

  const spamWords = [
    "free", "guaranteed", "act now", "limited time", "exclusive deal",
    "don't miss", "urgent", "winner", "congratulations", "click here",
    "buy now", "order now", "special promotion", "no obligation",
  ];

  let checked = 0;
  let passed = 0;
  let flagged = 0;

  for (const draft of drafts) {
    try {
      const emailContent = `Subject: ${draft.subject_line_1}\n\n${draft.body_first}`;

      // GlockApps API 호출
      const response = await fetch("https://gappie-api.glockapps.com/api/v1/spam-test", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GLOCKAPP_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subject: draft.subject_line_1,
          body: draft.body_first,
        }),
      });

      let spamScore = 10; // 기본값: 통과
      let spamStatus: string;

      if (response.ok) {
        const result = await response.json();
        spamScore = result.spam_score ?? result.score ?? 10;
      } else {
        // API 실패 시 로컬 스팸 단어 체크로 대체
        const lowerContent = emailContent.toLowerCase();
        const foundSpamWords = spamWords.filter((w) => lowerContent.includes(w));
        spamScore = foundSpamWords.length > 0 ? 6 : 9;
      }

      if (spamScore >= 8) {
        spamStatus = "pass";
        passed++;
      } else {
        // 7점 이하 → 위험단어 교체 후 재검사 1회
        let cleanedBody = draft.body_first;
        const lowerBody = cleanedBody.toLowerCase();

        // spscos.com 링크 최대 2개 조정
        const spsLinks = (cleanedBody.match(/spscos\.com/gi) || []).length;
        if (spsLinks > 2) {
          let count = 0;
          cleanedBody = cleanedBody.replace(/spscos\.com/gi, (match: string) => {
            count++;
            return count <= 2 ? match : "";
          });
        }

        // 외부 링크 최대 1개 조정
        const urlRegex = /https?:\/\/(?!.*spscos\.com)[^\s)]+/gi;
        const externalLinks = cleanedBody.match(urlRegex) || [];
        if (externalLinks.length > 1) {
          let extCount = 0;
          cleanedBody = cleanedBody.replace(urlRegex, (match: string) => {
            extCount++;
            return extCount <= 1 ? match : "";
          });
        }

        // 스팸 단어 교체
        for (const word of spamWords) {
          const regex = new RegExp(word, "gi");
          if (regex.test(cleanedBody)) {
            cleanedBody = cleanedBody.replace(regex, "");
          }
        }

        // 재검사 (1회)
        let retryScore = spamScore;
        try {
          const retryRes = await fetch("https://gappie-api.glockapps.com/api/v1/spam-test", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${GLOCKAPP_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              subject: draft.subject_line_1,
              body: cleanedBody,
            }),
          });

          if (retryRes.ok) {
            const retryResult = await retryRes.json();
            retryScore = retryResult.spam_score ?? retryResult.score ?? spamScore;
          }
        } catch {
          // 재검사 실패
        }

        if (retryScore >= 8) {
          spamStatus = "rewrite";
          spamScore = retryScore;
          // 수정된 본문 업데이트
          await supabase
            .from("email_drafts")
            .update({ body_first: cleanedBody })
            .eq("id", draft.id);
          passed++;
        } else {
          spamStatus = "flag"; // 동환님 검토 필요
          flagged++;
        }
      }

      // email_drafts 업데이트
      await supabase
        .from("email_drafts")
        .update({ spam_score: spamScore, spam_status: spamStatus })
        .eq("id", draft.id);

      checked++;
    } catch {
      // 개별 실패 시 계속
    }
  }

  await log(supabase, jobId, "E", "completed",
    `직원E 완료: ${checked}건 검토 (통과: ${passed}, 검토필요: ${flagged})`);
}

// ============================================
// 직원 F: 모니터링 (파이프라인 완료 후)
// ============================================
async function agentF(
  supabase: ReturnType<typeof createClient>,
  jobId: string,
  _team: string
) {
  await log(supabase, jobId, "F", "running", "직원F 시작: 시스템 모니터링");

  const warnings: string[] = [];

  // 1. Clay 크레딧 체크
  const CLAY_API_KEY = Deno.env.get("CLAY_API_KEY");
  if (CLAY_API_KEY) {
    try {
      const res = await fetch("https://api.clay.com/v3/credits", {
        headers: { Authorization: `Bearer ${CLAY_API_KEY}` },
      });
      if (res.ok) {
        const data = await res.json();
        const remaining = data.remaining_credits ?? data.credits ?? 0;
        if (remaining <= 500) {
          warnings.push(`Clay 크레딧 부족: ${remaining}개 남음 (500 이하)`);
        }
      }
    } catch {
      // API 체크 실패
    }
  }

  // 2. ZeroBounce 잔여량 체크
  const ZEROBOUNCE_API_KEY = Deno.env.get("ZEROBOUNCE_API_KEY");
  if (ZEROBOUNCE_API_KEY) {
    try {
      const res = await fetch(
        `https://api.zerobounce.net/v2/getcredits?api_key=${ZEROBOUNCE_API_KEY}`
      );
      if (res.ok) {
        const data = await res.json();
        const credits = data.Credits ?? 0;
        if (credits <= 200) {
          warnings.push(`ZeroBounce 크레딧 부족: ${credits}건 남음 (200 이하)`);
        }
      }
    } catch {
      // API 체크 실패
    }
  }

  // 3. Claude API 일일 비용 체크
  const today = new Date().toISOString().split("T")[0];
  const { data: todayLogs } = await supabase
    .from("pipeline_logs")
    .select("api_cost_usd")
    .in("agent", ["C", "D"])
    .gte("created_at", `${today}T00:00:00Z`);

  const dailyCost = (todayLogs || []).reduce(
    (sum: number, l: { api_cost_usd: number }) => sum + (l.api_cost_usd || 0), 0
  );

  if (dailyCost > 5) {
    warnings.push(`Claude API 일일 비용 초과: $${dailyCost.toFixed(2)} (상한 $5)`);
  }

  // 4. 8시간 미완료 파이프라인 체크
  const eightHoursAgo = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString();
  const { data: staleJobs } = await supabase
    .from("pipeline_jobs")
    .select("id, created_at")
    .eq("status", "running")
    .lt("created_at", eightHoursAgo);

  if (staleJobs && staleJobs.length > 0) {
    warnings.push(`${staleJobs.length}개 파이프라인이 8시간 이상 미완료`);
  }

  // 경고를 pipeline_logs에 기록
  const warningMsg = warnings.length > 0
    ? `경고 ${warnings.length}건: ${warnings.join(" | ")}`
    : "시스템 정상: 모든 API 상태 양호";

  await log(supabase, jobId, "F", "completed", warningMsg);
}

// ============================================
// 메인 핸들러
// ============================================
Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = getSupabase();

  try {
    const { jobId } = await req.json();

    if (!jobId) {
      return new Response(
        JSON.stringify({ error: "jobId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // job 정보 조회
    const { data: job, error: jobError } = await supabase
      .from("pipeline_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 즉시 응답 반환 (클라이언트는 여기서 끊어도 됨)
    // EdgeRuntime.waitUntil 사용하여 백그라운드 실행
    const backgroundTask = (async () => {
      // job 상태 → running
      await supabase
        .from("pipeline_jobs")
        .update({ status: "running", started_at: new Date().toISOString(), current_agent: "A" })
        .eq("id", jobId);

      const agents = [
        { name: "A", fn: agentA },
        { name: "B", fn: agentB },
        { name: "C", fn: agentC },
        { name: "D", fn: agentD },
        { name: "E", fn: agentE },
        { name: "F", fn: agentF },
      ];

      let failed = false;

      for (const agent of agents) {
        // current_agent 업데이트
        await supabase
          .from("pipeline_jobs")
          .update({ current_agent: agent.name })
          .eq("id", jobId);

        try {
          await agent.fn(supabase, jobId, job.team);
        } catch (error) {
          await log(supabase, jobId, agent.name, "failed",
            `치명적 오류: ${error instanceof Error ? error.message : String(error)}`);
          failed = true;
          break;
        }
      }

      // job 완료 처리
      await supabase
        .from("pipeline_jobs")
        .update({
          status: failed ? "failed" : "completed",
          completed_at: new Date().toISOString(),
          current_agent: null,
        })
        .eq("id", jobId);
    })();

    // 백그라운드 실행 등록
    // @ts-ignore: EdgeRuntime is available in Supabase Edge Functions
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(backgroundTask);
    } else {
      // fallback: await (개발 환경)
      backgroundTask.catch(console.error);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "파이프라인이 시작되었습니다. 브라우저를 닫으셔도 결과는 자동으로 저장됩니다.",
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
