// 서버 사이드 전용 Supabase 클라이언트 (service_role).
// route handler / server component 에서만 사용 — 절대 client bundle에 포함 금지.

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

export function getServiceSupabase(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL 환경변수 없음');
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY 환경변수 없음 — Vercel Project Settings에서 등록 필요');

  cached = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
