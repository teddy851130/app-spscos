// SPS Send-Email Edge Function
// nodemailer로 Gmail SMTP 발송 + email_logs 기록
//
// 교체 이력:
//   v1: denomailer@1.6.0 사용 → Gmail SMTP 프로토콜 "invalid cmd" 에러 발생
//   v2: nodemailer@6.9.16 (npm specifier) — Gmail 호환성 검증된 Node.js 생태계 표준
//
// 입력 (POST JSON):
// {
//   to: string           // 수신자 이메일 (필수)
//   toName?: string      // 수신자 이름 (선택)
//   subject: string      // 제목 (필수)
//   body: string         // 본문 plain text (필수)
//   buyerId?: string     // 바이어 UUID — 있으면 email_logs에 기록
// }
//
// 출력 성공: { success: true, message: "발송 완료", logId?: string }
// 출력 실패: { success: false, error: "..." }
//
// 필수 환경변수 (Supabase Secrets):
//   SMTP_HOST      예) smtp.gmail.com
//   SMTP_PORT      예) 587 (STARTTLS) 또는 465 (SSL)
//   SMTP_USER      예) teddy@spscos.com
//   SMTP_PASS      Gmail 앱 비밀번호 (16자, 공백 제거)
//   SUPABASE_URL              — Supabase가 자동 주입
//   SERVICE_ROLE_KEY 또는 SUPABASE_SERVICE_ROLE_KEY — email_logs INSERT용

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";

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
  const serviceKey = Deno.env.get("SERVICE_ROLE_KEY")
    ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(Deno.env.get("SUPABASE_URL")!, serviceKey!);
}

// 필수 환경변수 사전 검증 — 조용히 실패하지 않도록 명확히 에러 반환
function checkEnv(): string | null {
  const required = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS"];
  const missing = required.filter((k) => !Deno.env.get(k));
  if (missing.length > 0) {
    return `필수 환경변수 누락: ${missing.join(", ")} — Supabase Secrets에 등록 필요`;
  }
  return null;
}

// 간단한 이메일 주소 형식 검증
function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "POST 메서드만 허용" }, 405);
  }

  // 환경변수 체크
  const envErr = checkEnv();
  if (envErr) {
    return jsonResponse({ success: false, error: envErr }, 500);
  }

  // 요청 본문 파싱
  let payload: {
    to?: string;
    toName?: string;
    subject?: string;
    body?: string;
    buyerId?: string;
  };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ success: false, error: "요청 본문 JSON 파싱 실패" }, 400);
  }

  const { to, toName, subject, body: emailBody, buyerId } = payload;

  // 입력 검증
  if (!to || !subject || !emailBody) {
    return jsonResponse(
      { success: false, error: "to, subject, body 필드는 필수입니다" },
      400,
    );
  }
  if (!isValidEmail(to)) {
    return jsonResponse(
      { success: false, error: `잘못된 이메일 주소 형식: ${to}` },
      400,
    );
  }

  const smtpUser = Deno.env.get("SMTP_USER")!;
  const smtpPort = Number(Deno.env.get("SMTP_PORT")!);

  // nodemailer transporter 생성
  // Gmail 기준: 587=STARTTLS(secure:false), 465=SSL(secure:true)
  const transporter = nodemailer.createTransport({
    host: Deno.env.get("SMTP_HOST"),
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: smtpUser,
      pass: Deno.env.get("SMTP_PASS"),
    },
  });

  // 발송 시도
  try {
    const info = await transporter.sendMail({
      from: `Teddy Shin <${smtpUser}>`,
      to: toName ? `"${toName}" <${to}>` : to,
      subject,
      text: emailBody, // plain text 본문
      html: emailBody.replace(/\n/g, "<br>"), // 줄바꿈만 HTML로 변환
    });
    console.log(`[send-email] 발송 성공: messageId=${info.messageId}, to=${to}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[send-email] SMTP 실패: ${msg}`);
    return jsonResponse(
      { success: false, error: `SMTP 발송 실패: ${msg}` },
      502,
    );
  }

  // email_logs 기록 (buyerId가 있을 때만)
  // 발송은 이미 성공했으므로, 로그 실패는 warning으로만 반환하고 success=true 유지
  let logId: string | undefined;
  if (buyerId) {
    try {
      const sb = getSupabase();
      const { data, error } = await sb
        .from("email_logs")
        .insert({
          buyer_id: buyerId,
          email_type: "initial", // TODO: 팔로업 구분은 Step 2에서 처리
          subject,
          body_en: emailBody,
          status: "sent",
          sent_at: new Date().toISOString(),
          pipedrive_bcc_sent: false,
        })
        .select("id")
        .single();

      if (error) throw error;
      logId = data?.id;
    } catch (logErr) {
      const msg = logErr instanceof Error ? logErr.message : String(logErr);
      console.warn(`[send-email] email_logs 기록 실패: ${msg}`);
      return jsonResponse(
        {
          success: true,
          warning: `발송은 성공했으나 email_logs 기록 실패: ${msg}`,
          message: "발송 완료 (로그 기록 실패)",
        },
        200,
      );
    }
  }

  return jsonResponse(
    { success: true, message: "발송 완료", logId },
    200,
  );
});
