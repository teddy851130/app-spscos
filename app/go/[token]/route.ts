// PR13: 클릭 추적 redirect 엔드포인트.
// /go/{tracking_token} → click_events INSERT + contact_status 갱신 + Pipedrive Activity
// → 302 https://spscos.com/
//
// 바이어에게는 URL만 노출되고 추적 자체는 인지 못 함.
// Pipedrive 호출은 타임아웃 4초 — 실패해도 리다이렉트는 정상 실행.

import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/app/lib/supabaseAdmin';
import { createWebsiteVisitedActivity } from '@/app/lib/pipedrive';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FALLBACK_DEST = 'https://spscos.com/';
const PROTECTED_STATUSES = new Set(['Sample', 'Deal', 'Lost', 'Bounced']);

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const token = (params.token ?? '').trim();

  // 토큰 형식 최소 검증 (12자 hex) — 위조 시도 빠른 폐기
  if (!/^[0-9a-f]{12}$/.test(token)) {
    return NextResponse.redirect(FALLBACK_DEST, 302);
  }

  const sb = getServiceSupabase();

  const { data: contact, error: findErr } = await sb
    .from('buyer_contacts')
    .select('id, contact_name, contact_email, contact_status, buyer_id')
    .eq('tracking_token', token)
    .maybeSingle();

  if (findErr || !contact) {
    return NextResponse.redirect(FALLBACK_DEST, 302);
  }

  const clickedAt = new Date().toISOString();
  const userAgent = req.headers.get('user-agent') ?? null;
  const referer = req.headers.get('referer') ?? null;
  const ipAddress =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    null;
  const ipCountry = req.headers.get('x-vercel-ip-country') ?? null;

  const { data: insertedEvent } = await sb
    .from('click_events')
    .insert({
      buyer_contact_id: contact.id,
      tracking_token: token,
      clicked_at: clickedAt,
      user_agent: userAgent,
      ip_address: ipAddress,
      ip_country: ipCountry,
      referer,
      pipedrive_status: 'pending',
    })
    .select('id')
    .single();

  // 기존 상태가 Sample/Deal/Lost/Bounced 면 덮어쓰지 않음 (하위 단계 보호)
  if (!PROTECTED_STATUSES.has(contact.contact_status ?? '')) {
    await sb
      .from('buyer_contacts')
      .update({ contact_status: 'Interested' })
      .eq('id', contact.id);
  }

  // 회사명 조회 (Pipedrive note 용)
  let companyName = '';
  if (contact.buyer_id) {
    const { data: buyer } = await sb
      .from('buyers')
      .select('company_name')
      .eq('id', contact.buyer_id)
      .maybeSingle();
    companyName = buyer?.company_name ?? '';
  }

  // Pipedrive Activity — 타임아웃 4초 내 완료 예상. 실패해도 리다이렉트는 계속.
  if (contact.contact_email) {
    const result = await createWebsiteVisitedActivity({
      contactEmail: contact.contact_email,
      contactName: contact.contact_name ?? '',
      companyName,
      clickedAt,
    });

    if (insertedEvent?.id) {
      await sb
        .from('click_events')
        .update({
          pipedrive_status: result.status,
          pipedrive_activity_id: result.activityId ?? null,
          pipedrive_error: result.error ?? null,
        })
        .eq('id', insertedEvent.id);
    }
    // 실패/스킵은 click_events.pipedrive_error에 남아 있음 → agentF(모니터링)가 집계.
    // pipeline_logs는 agent CHECK가 A~F만 허용 + job_id FK 필수라 부적합.
  }

  return NextResponse.redirect(FALLBACK_DEST, 302);
}
