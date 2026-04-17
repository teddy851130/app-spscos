// Pipedrive API 연동 (PR13 옵션 C).
// 클릭 이벤트 발생 시 "Website visited" Activity를 해당 바이어 Person에 자동 등록.
// 실패 시 조용한 폴백 금지 — pipeline_logs failed + agentF 경고 (feedback_api_credit_alert).

const PIPEDRIVE_API_BASE = 'https://api.pipedrive.com/v1';
const ACTIVITY_TIMEOUT_MS = 4000;

export interface PipedriveActivityResult {
  status: 'success' | 'failed' | 'skipped';
  activityId?: number;
  error?: string;
}

interface PipedrivePerson {
  id: number;
  name: string;
  email?: Array<{ value: string; primary: boolean }>;
}

async function pipedriveFetch<T>(path: string, init: RequestInit, timeoutMs = ACTIVITY_TIMEOUT_MS): Promise<T> {
  const token = process.env.PIPEDRIVE_API_TOKEN;
  if (!token) throw new Error('PIPEDRIVE_API_TOKEN 없음');

  const url = new URL(`${PIPEDRIVE_API_BASE}${path}`);
  url.searchParams.set('api_token', token);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url.toString(), {
      ...init,
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
    const body = (await res.json().catch(() => ({}))) as { success?: boolean; data?: T; error?: string };
    if (!res.ok || body.success === false) {
      throw new Error(`Pipedrive HTTP ${res.status}: ${body.error ?? 'unknown'}`);
    }
    return body.data as T;
  } finally {
    clearTimeout(timer);
  }
}

async function findPersonByEmail(email: string): Promise<PipedrivePerson | null> {
  const encoded = encodeURIComponent(email);
  const data = await pipedriveFetch<{ items: Array<{ item: PipedrivePerson }> }>(
    `/persons/search?term=${encoded}&fields=email&exact_match=true&limit=1`,
    { method: 'GET' },
  );
  return data?.items?.[0]?.item ?? null;
}

export async function createWebsiteVisitedActivity(params: {
  contactEmail: string;
  contactName: string;
  companyName: string;
  clickedAt: string;
}): Promise<PipedriveActivityResult> {
  if (!process.env.PIPEDRIVE_API_TOKEN) {
    return { status: 'skipped', error: 'PIPEDRIVE_API_TOKEN 미설정' };
  }

  try {
    const person = await findPersonByEmail(params.contactEmail);
    if (!person) {
      return { status: 'skipped', error: `Pipedrive Person 없음 (${params.contactEmail})` };
    }

    const note = `${params.contactName} (${params.companyName}) 이(가) 메일 P.S. 링크 클릭 → spscos.com 방문 [${params.clickedAt}]`;
    const created = await pipedriveFetch<{ id: number }>(`/activities`, {
      method: 'POST',
      body: JSON.stringify({
        subject: 'Website visited',
        type: 'task',
        person_id: person.id,
        note,
        done: 1,
      }),
    });

    return { status: 'success', activityId: created.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: 'failed', error: msg };
  }
}
