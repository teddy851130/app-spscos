'use client';

// PR13: 대시보드 "오늘의 관심 리드" 위젯.
// click_events (최근 72시간) + buyer_contacts + buyers 조인해 클릭한 바이어 카드 표시.
// Teddy가 하루 1~2회 체크 → 수동 팔로업 타이밍 포착.

import { useEffect, useState } from 'react';
import { MousePointerClick, ExternalLink } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface InterestedLead {
  click_event_id: string;
  clicked_at: string;
  pipedrive_status: string;
  contact_id: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_status: string | null;
  buyer_id: string | null;
  company_name: string | null;
  tier: string | null;
  region: string | null;
}

interface RawRow {
  id: string;
  clicked_at: string;
  pipedrive_status: string;
  buyer_contact_id: string;
  buyer_contacts: {
    id: string;
    contact_name: string | null;
    contact_email: string | null;
    contact_status: string | null;
    buyer_id: string | null;
    buyers: {
      id: string;
      company_name: string | null;
      tier: string | null;
      region: string | null;
    } | null;
  } | null;
}

const WINDOW_HOURS = 72;

function formatRelative(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMin = Math.round((now - then) / 60000);
  if (diffMin < 1) return '방금';
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}시간 전`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}일 전`;
}

export default function InterestedLeadsWidget({ onNavigateBuyers }: { onNavigateBuyers?: () => void }) {
  const [leads, setLeads] = useState<InterestedLead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const since = new Date(Date.now() - WINDOW_HOURS * 3600_000).toISOString();

      const { data, error } = await supabase
        .from('click_events')
        .select(`
          id, clicked_at, pipedrive_status, buyer_contact_id,
          buyer_contacts:buyer_contact_id (
            id, contact_name, contact_email, contact_status, buyer_id,
            buyers:buyer_id ( id, company_name, tier, region )
          )
        `)
        .gte('clicked_at', since)
        .order('clicked_at', { ascending: false })
        .limit(30);

      if (cancelled) return;
      if (error) {
        console.error('InterestedLeads 로드 실패:', error);
        setLeads([]);
        setLoading(false);
        return;
      }

      const mapped: InterestedLead[] = ((data ?? []) as unknown as RawRow[]).map((r) => ({
        click_event_id: r.id,
        clicked_at: r.clicked_at,
        pipedrive_status: r.pipedrive_status,
        contact_id: r.buyer_contacts?.id ?? r.buyer_contact_id,
        contact_name: r.buyer_contacts?.contact_name ?? null,
        contact_email: r.buyer_contacts?.contact_email ?? null,
        contact_status: r.buyer_contacts?.contact_status ?? null,
        buyer_id: r.buyer_contacts?.buyer_id ?? null,
        company_name: r.buyer_contacts?.buyers?.company_name ?? null,
        tier: r.buyer_contacts?.buyers?.tier ?? null,
        region: r.buyer_contacts?.buyers?.region ?? null,
      }));

      setLeads(mapped);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="bg-[#ffffff] border border-[#e3e8ee] rounded-lg p-5">
        <div className="text-sm text-[#8792a2]">관심 리드 로딩 중…</div>
      </div>
    );
  }

  if (leads.length === 0) {
    return (
      <div className="bg-[#ffffff] border border-[#e3e8ee] rounded-lg p-5">
        <div className="flex items-center gap-2 mb-2">
          <MousePointerClick className="w-4 h-4 text-[#635BFF]" />
          <div className="text-sm font-semibold text-[#1a1f36]">오늘의 관심 리드</div>
        </div>
        <div className="text-xs text-[#8792a2]">
          최근 {WINDOW_HOURS}시간 내 메일 P.S. 링크를 클릭한 바이어가 없습니다.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#ffffff] border border-[#e3e8ee] rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MousePointerClick className="w-4 h-4 text-[#635BFF]" />
          <div>
            <div className="text-sm font-semibold text-[#1a1f36]">오늘의 관심 리드</div>
            <div className="text-xs text-[#8792a2] mt-0.5">
              최근 {WINDOW_HOURS}시간 클릭 — {leads.length}건
            </div>
          </div>
        </div>
        {onNavigateBuyers && (
          <button
            onClick={onNavigateBuyers}
            className="text-xs text-[#635BFF] hover:underline flex items-center gap-1"
          >
            바이어 목록으로
            <ExternalLink className="w-3 h-3" />
          </button>
        )}
      </div>

      <div className="space-y-2 max-h-[360px] overflow-y-auto">
        {leads.map((lead) => {
          const tierColor = lead.tier === 'Tier1'
            ? 'bg-[#22c55e]/20 text-[#22c55e]'
            : lead.tier === 'Tier2'
              ? 'bg-[#f59e0b]/20 text-[#f59e0b]'
              : 'bg-[#e3e8ee] text-[#697386]';
          const pipedriveBadge = lead.pipedrive_status === 'success'
            ? { label: 'Pipedrive 기록됨', color: 'bg-[#635BFF]/15 text-[#635BFF]' }
            : lead.pipedrive_status === 'failed'
              ? { label: 'Pipedrive 실패', color: 'bg-[#ef4444]/15 text-[#ef4444]' }
              : lead.pipedrive_status === 'skipped'
                ? { label: 'Pipedrive 생략', color: 'bg-[#8792a2]/15 text-[#697386]' }
                : null;

          return (
            <div
              key={lead.click_event_id}
              className="flex items-center justify-between p-3 bg-[#f6f8fa] rounded-lg border border-[#e3e8ee]"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-[#1a1f36] truncate">
                    {lead.contact_name || '담당자 미상'}
                  </span>
                  <span className="text-xs text-[#8792a2] truncate">
                    @ {lead.company_name || '회사 미상'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-[#697386]">
                  <span>{formatRelative(lead.clicked_at)}</span>
                  {lead.region && <span>· {lead.region}</span>}
                  {lead.contact_email && <span className="truncate">· {lead.contact_email}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                {lead.tier && (
                  <span className={`text-xs px-2 py-0.5 rounded font-semibold ${tierColor}`}>
                    {lead.tier}
                  </span>
                )}
                {pipedriveBadge && (
                  <span className={`text-[10px] px-2 py-0.5 rounded ${pipedriveBadge.color}`}>
                    {pipedriveBadge.label}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
