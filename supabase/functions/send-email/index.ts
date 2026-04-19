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
//   contactId?: string   // 담당자 UUID — buyer_activities에 연결 (선택)
//   emailType?: string   // initial | followup1 | followup2 | breakup (기본값: initial)
//   attachments?: Array<{  // PR15(ADR-035): 첨부 파일. 총 4MB 제한(base64 팽창 + Edge Function body 한계).
//     name: string            // 파일명
//     contentType: string     // MIME 타입 (application/pdf 등)
//     content_base64: string  // base64 인코딩 문자열 (data URI prefix 없이 순수 payload)
//   }>
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
    contactId?: string;
    emailType?: string;
    attachments?: Array<{ name?: string; contentType?: string; content_base64?: string }>;
  };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ success: false, error: "요청 본문 JSON 파싱 실패" }, 400);
  }

  const { to, toName, subject, body: emailBody, buyerId, contactId, emailType, attachments } = payload;

  // PR15(ADR-035): 첨부 파일 검증. 총 base64 크기 4MB 이하로 제한.
  const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
  let totalAttachmentBytes = 0;
  const normalizedAttachments: Array<{ filename: string; content: string; encoding: "base64"; contentType?: string }> = [];
  if (Array.isArray(attachments)) {
    for (const a of attachments) {
      if (!a?.name || !a?.content_base64) {
        return jsonResponse({ success: false, error: "첨부 파일의 name/content_base64 누락" }, 400);
      }
      totalAttachmentBytes += a.content_base64.length;
      normalizedAttachments.push({
        filename: a.name,
        content: a.content_base64,
        encoding: "base64",
        contentType: a.contentType,
      });
    }
    if (totalAttachmentBytes > MAX_ATTACHMENT_BYTES) {
      const mb = (totalAttachmentBytes / 1024 / 1024).toFixed(2);
      return jsonResponse(
        { success: false, error: `첨부 파일 합계 ${mb}MB — 4MB 이하만 허용` },
        413,
      );
    }
  }
  // emailType 유효성 검사 — 허용된 값만 사용
  const validEmailTypes = ["initial", "followup1", "followup2", "breakup"];
  const resolvedEmailType = validEmailTypes.includes(emailType ?? "") ? emailType! : "initial";

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
      attachments: normalizedAttachments.length > 0 ? normalizedAttachments : undefined,
    });
    console.log(`[send-email] 발송 성공: messageId=${info.messageId}, to=${to}, attachments=${normalizedAttachments.length}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[send-email] SMTP 실패: ${msg}`);
    return jsonResponse(
      { success: false, error: `SMTP 발송 실패: ${msg}` },
      502,
    );
  }

  // email_logs 기록 + buyer_activities + 팔로업 스케줄링 (buyerId가 있을 때만)
  // 발송은 이미 성공했으므로, 로그 실패는 warning으로만 반환하고 success=true 유지
  let logId: string | undefined;
  if (buyerId) {
    try {
      const sb = getSupabase();
      const now = new Date().toISOString();

      // 1) email_logs에 기록
      const { data, error } = await sb
        .from("email_logs")
        .insert({
          buyer_id: buyerId,
          email_type: resolvedEmailType,
          subject,
          body_en: emailBody,
          status: "sent",
          sent_at: now,
          pipedrive_bcc_sent: false,
        })
        .select("id")
        .single();

      if (error) throw error;
      logId = data?.id;

      // 2) buyers 업데이트 — PR1 이후 원자적 RPC 사용
      // 팔로업 날짜는 tier에 따라 다르므로 tier만 먼저 조회 (RPC 파라미터 계산용).
      // email_count 증가 + last_sent_at + status 전이는 increment_email_sent RPC가 한 트랜잭션에서 처리.
      const { data: buyerData } = await sb
        .from("buyers")
        .select("tier")
        .eq("id", buyerId)
        .single();

      const tier = buyerData?.tier ?? "Tier2";

      // 팔로업 날짜 계산: Tier1은 5일 후, Tier2는 7일 후
      // breakup 메일이면 팔로업 예약하지 않음
      let nextFollowup: string | null = null;
      if (resolvedEmailType !== "breakup") {
        const followupDays = tier === "Tier1" ? 5 : 7;
        const followupDate = new Date();
        followupDate.setDate(followupDate.getDate() + followupDays);
        nextFollowup = followupDate.toISOString();
      }

      // 원자적 증감: email_count +1, last_sent_at, next_followup_at, status 전이를 한 번에.
      // (migration 008에서 정의된 increment_email_sent RPC)
      const { error: rpcError } = await sb.rpc("increment_email_sent", {
        p_buyer_id: buyerId,
        p_sent_at: now,
        p_next_followup_at: nextFollowup,
      });
      if (rpcError) {
        // P0002 = buyer 존재하지 않음. SMTP는 이미 나간 상태이므로 데이터 복구 불가.
        // 운영 관찰성을 위해 명시적 로그를 남기고 상위 catch로 던짐.
        const code = (rpcError as { code?: string }).code;
        if (code === "P0002") {
          console.error(`[send-email] 치명적: RPC P0002 — buyer=${buyerId} 존재하지 않음. SMTP는 이미 발송됨.`);
        }
        throw rpcError;
      }

      // 3) buyer_activities에 활동 기록
      const emailTypeLabel: Record<string, string> = {
        initial: "초기 메일",
        followup1: "1차 팔로업",
        followup2: "2차 팔로업",
        breakup: "마지막 메일",
      };
      await sb
        .from("buyer_activities")
        .insert({
          buyer_id: buyerId,
          contact_id: contactId || null,
          activity_type: "email_sent",
          description: `${emailTypeLabel[resolvedEmailType] ?? resolvedEmailType} 발송: ${subject}`,
          metadata: {
            email_log_id: logId,
            email_type: resolvedEmailType,
            to,
            subject,
          },
          created_by: "system",
        });

      console.log(`[send-email] 활동 기록 완료: type=${resolvedEmailType}, followup=${nextFollowup}`);
    } catch (logErr) {
      const msg = logErr instanceof Error ? logErr.message : String(logErr);
      console.warn(`[send-email] email_logs/activity 기록 실패: ${msg}`);
      return jsonResponse(
        {
          success: true,
          warning: `발송은 성공했으나 기록 실패: ${msg}`,
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
