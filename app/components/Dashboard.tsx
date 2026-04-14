'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { EmailDraft, PipelineLog } from '../lib/types';

interface BuyerRow {
  id: string;
  company_name: string;
  region: string;
  tier: string;
  status: string;
  contact_name: string;
  contact_email: string;
  last_sent_at: string | null;
  updated_at: string;
  created_at: string;
  is_blacklisted?: boolean;
  team?: string;
  discovered_at?: string;
  next_followup_at?: string | null;
}

// 팔로업 대기 목록용 인터페이스
interface FollowupBuyer {
  id: string;
  company_name: string;
  contact_name: string;
  tier: string;
  last_sent_at: string | null;
  next_followup_at: string;
  contact_email: string;
  region: string;
  status: string;
  badge: 'overdue' | 'today' | 'tomorrow'; // 긴급/오늘/내일 구분
}

interface KPI {
  sent: number;
  replied: number;
  total_sent: number;
  deliveryRate: number;
  openRate: number;
  replyRate: number;
}

interface TeamStat {
  region: string;
  flag: string;
  sent: number;
  replied: number;
  replyRate: string;
  leads: number;
  status: string;
  statusColor: string;
}

interface ChartDay {
  date: string;
  gcc: number;
  usa: number;
  europe: number;
}

interface RecentReply {
  from: string;
  company: string;
  preview: string;
  tag: string;
}

export default function Dashboard() {
  const [kpi, setKpi] = useState<KPI | null>(null);
  const [teamStats, setTeamStats] = useState<TeamStat[]>([]);
  const [chartData, setChartData] = useState<ChartDay[]>([]);
  const [recentReplies, setRecentReplies] = useState<RecentReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [alertDismissed, setAlertDismissed] = useState(false);
  // North Star Metric: 이번 주 긍정 회신 (Interested/Sample/Deal)
  const [northStar, setNorthStar] = useState(0);
  // 바운스율 경고 (> 5% 시 활성)
  const [bounceAlert, setBounceAlert] = useState(false);
  const [bounceRate, setBounceRate] = useState(0);
  const [alertTeam, setAlertTeam] = useState<string | null>(null);
  const [todayStats, setTodayStats] = useState({ companies: 0, contacts: 0, tier1: 0, tier2: 0, tier3: 0 });
  const [emailDrafts, setEmailDrafts] = useState<(EmailDraft & { contact_name?: string; company_name?: string })[]>([]);
  const [flaggedDrafts, setFlaggedDrafts] = useState<(EmailDraft & { contact_name?: string; company_name?: string })[]>([]);
  const [pendingIntelDrafts, setPendingIntelDrafts] = useState<(EmailDraft & { contact_name?: string; company_name?: string })[]>([]);
  const [systemWarnings, setSystemWarnings] = useState<string[]>([]);
  const [previewDraft, setPreviewDraft] = useState<(EmailDraft & { contact_name?: string; company_name?: string }) | null>(null);
  // 팔로업 대기 목록
  const [followupBuyers, setFollowupBuyers] = useState<FollowupBuyer[]>([]);

  useEffect(() => {
    async function loadDashboard() {
      try {
        setLoading(true);

        // Fetch all buyers
        const { data: buyers, error } = await supabase
          .from('buyers')
          .select('id, company_name, region, tier, status, contact_name, contact_email, last_sent_at, updated_at, created_at')
          .order('last_sent_at', { ascending: false });

        if (error || !buyers) {
          console.error('Dashboard fetch error:', error);
          return;
        }

        const now = new Date();
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        // 이번 주 발송: last_sent_at 기준 (바이어 수)
        const thisWeekSent = buyers.filter(
          (b) => b.last_sent_at && new Date(b.last_sent_at) >= oneWeekAgo
        );

        // 전체 발송: email_logs 테이블에서 실제 발송 건수를 가져옴
        const { count: emailLogCount } = await supabase
          .from('email_logs')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'sent');
        const totalEmailsSent = emailLogCount ?? 0;

        // 반송 건수
        const { count: bouncedCount } = await supabase
          .from('email_logs')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'bounced');
        const totalBounced = bouncedCount ?? 0;

        const totalReplied = buyers.filter((b) => b.status === 'Replied');

        const replyRate = totalEmailsSent > 0
          ? Math.round((totalReplied.length / totalEmailsSent) * 100 * 10) / 10
          : 0;

        // 전달율: (발송 - 반송) / 발송 — 반송되지 않은 비율
        const deliveryRate = totalEmailsSent > 0
          ? Math.round(((totalEmailsSent - totalBounced) / totalEmailsSent) * 1000) / 10
          : 0;

        setKpi({
          sent: thisWeekSent.length,
          replied: totalReplied.length,
          total_sent: totalEmailsSent,
          deliveryRate,
          openRate: 0, // 추적 픽셀 미구현
          replyRate,
        });

        // North Star Metric: 이번 주 긍정 회신 (Interested/Sample/Deal)
        const thisMonday = new Date(now);
        thisMonday.setDate(thisMonday.getDate() - ((thisMonday.getDay() + 6) % 7)); // 이번 주 월요일
        thisMonday.setHours(0, 0, 0, 0);
        const positiveStatuses = ['Interested', 'Sample', 'Deal'];
        const weekPositive = buyers.filter(
          (b) => positiveStatuses.includes(b.status)
            && b.updated_at && new Date(b.updated_at) >= thisMonday
        );
        setNorthStar(weekPositive.length);

        // 바운스율 경고 (email_logs 기반)
        const bRate = totalEmailsSent > 0
          ? Math.round((totalBounced / totalEmailsSent) * 1000) / 10
          : 0;
        setBounceRate(bRate);
        setBounceAlert(bRate > 5);

        // Team stats
        const regions = [
          { key: 'GCC', flag: '🇸🇦' },
          { key: 'USA', flag: '🇺🇸' },
          { key: 'Europe', flag: '🇬🇧' },
        ];

        const stats: TeamStat[] = regions.map(({ key, flag }) => {
          const regionBuyers = buyers.filter((b) => b.region === key);
          const regionSent = regionBuyers.filter((b) => b.status && b.status !== 'Cold');
          const regionReplied = regionBuyers.filter((b) => b.status === 'Replied');
          const rate = regionSent.length > 0
            ? Math.round((regionReplied.length / regionSent.length) * 100 * 10) / 10
            : 0;

          let statusLabel = '✓ 정상';
          let statusColor = 'bg-[#22c55e]/20 text-[#22c55e]';
          if (rate < 5 && regionSent.length > 0) {
            statusLabel = '⚠ 경고';
            statusColor = 'bg-[#ef4444]/20 text-[#ef4444]';
          } else if (rate < 10 && regionSent.length > 0) {
            statusLabel = '△ 주의';
            statusColor = 'bg-[#f59e0b]/20 text-[#f59e0b]';
          }

          return {
            region: key,
            flag,
            sent: regionSent.length,
            replied: regionReplied.length,
            replyRate: `${rate}%`,
            leads: regionReplied.length,
            status: statusLabel,
            statusColor,
          };
        });

        setTeamStats(stats);

        // Alert: check if any team has low reply rate
        const lowTeam = stats.find(
          (s) => s.status === '⚠ 경고' || (s.sent > 0 && parseFloat(s.replyRate) < 10)
        );
        if (lowTeam) setAlertTeam(lowTeam.region);

        // Recent replies
        const replied = buyers
          .filter((b) => b.status === 'Replied')
          .slice(0, 4)
          .map((b) => ({
            from: b.contact_name || '담당자',
            company: b.company_name || '',
            preview: `회신 수신됨 — 상세 내용은 Gmail에서 확인하세요.`,
            tag: '회신',
          }));
        setRecentReplies(replied);

        // Chart data: last 7 days — count of buyers with last_sent_at in each day, by region
        const days: ChartDay[] = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date(now);
          d.setDate(d.getDate() - i);
          const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
          const dayStart = new Date(d);
          dayStart.setHours(0, 0, 0, 0);
          const dayEnd = new Date(d);
          dayEnd.setHours(23, 59, 59, 999);

          const dayBuyers = buyers.filter(
            (b) => b.last_sent_at
              && new Date(b.last_sent_at) >= dayStart
              && new Date(b.last_sent_at) <= dayEnd
          );

          days.push({
            date: dateStr,
            gcc: dayBuyers.filter((b) => b.region === 'GCC').length,
            usa: dayBuyers.filter((b) => b.region === 'USA').length,
            europe: dayBuyers.filter((b) => b.region === 'Europe').length,
          });
        }
        setChartData(days);
        // Pipeline results: 오늘 발굴 기업/담당자 수
        const todayStr = new Date().toISOString().split('T')[0];
        const { data: todayBuyers } = await supabase
          .from('buyers')
          .select('id, tier')
          .gte('discovered_at', `${todayStr}T00:00:00Z`);

        if (todayBuyers) {
          const { count: contactCount } = await supabase
            .from('buyer_contacts')
            .select('id', { count: 'exact', head: true })
            .in('buyer_id', todayBuyers.map((b: { id: string }) => b.id));

          setTodayStats({
            companies: todayBuyers.length,
            contacts: contactCount || 0,
            tier1: todayBuyers.filter((b: { tier: string }) => b.tier === 'Tier1').length,
            tier2: todayBuyers.filter((b: { tier: string }) => b.tier === 'Tier2').length,
            tier3: todayBuyers.filter((b: { tier: string }) => b.tier === 'Tier3').length,
          });
        }

        // Email drafts 로드
        const { data: drafts } = await supabase
          .from('email_drafts')
          .select('*, buyer_contacts(contact_name, contact_email, buyer_id)')
          .order('created_at', { ascending: false })
          .limit(20);

        if (drafts && drafts.length > 0) {
          // buyer 정보 조인
          const contactData = drafts.map((d: Record<string, unknown>) => d.buyer_contacts as Record<string, unknown>).filter(Boolean);
          const buyerIds = [...new Set(contactData.map((c) => (c as Record<string, unknown>)?.buyer_id).filter(Boolean))] as string[];

          const { data: draftBuyers } = await supabase
            .from('buyers')
            .select('id, company_name')
            .in('id', buyerIds);

          const buyerNameMap = new Map((draftBuyers || []).map((b: { id: string; company_name: string }) => [b.id, b.company_name]));

          const enrichedDrafts = drafts.map((d: Record<string, unknown>) => ({
            ...d,
            contact_name: (d.buyer_contacts as Record<string, unknown>)?.contact_name || '',
            company_name: buyerNameMap.get((d.buyer_contacts as Record<string, unknown>)?.buyer_id as string) || '',
          })) as (EmailDraft & { contact_name?: string; company_name?: string })[];

          setEmailDrafts(enrichedDrafts.filter((d) => d.spam_status !== 'flag' && d.spam_status !== 'pending_intel'));
          setFlaggedDrafts(enrichedDrafts.filter((d) => d.spam_status === 'flag'));
          setPendingIntelDrafts(enrichedDrafts.filter((d) => (d.spam_status as string) === 'pending_intel'));
        }

        // 시스템 경고 (직원 F 최근 로그)
        const { data: fLogs } = await supabase
          .from('pipeline_logs')
          .select('message')
          .eq('agent', 'F')
          .eq('status', 'completed')
          .order('created_at', { ascending: false })
          .limit(1);

        if (fLogs && fLogs.length > 0 && fLogs[0].message.includes('경고')) {
          const warningParts = fLogs[0].message.split(': ').slice(1).join(': ').split(' | ');
          setSystemWarnings(warningParts);
        }

        // 팔로업 대기 목록 조회
        // KST 기준으로 오늘 시작/끝, 내일 끝 계산
        const kstOffset = 9 * 60 * 60 * 1000; // UTC+9
        const nowUtc = new Date();
        const kstNow = new Date(nowUtc.getTime() + kstOffset);
        const kstTodayStart = new Date(kstNow);
        kstTodayStart.setHours(0, 0, 0, 0);
        const kstTodayEnd = new Date(kstNow);
        kstTodayEnd.setHours(23, 59, 59, 999);
        const kstTomorrowEnd = new Date(kstTodayEnd.getTime() + 24 * 60 * 60 * 1000);

        // UTC로 변환하여 Supabase 쿼리에 사용
        const todayStartUtc = new Date(kstTodayStart.getTime() - kstOffset).toISOString();
        const todayEndUtc = new Date(kstTodayEnd.getTime() - kstOffset).toISOString();
        const tomorrowEndUtc = new Date(kstTomorrowEnd.getTime() - kstOffset).toISOString();

        const excludeStatuses = ['Lost', 'Deal', 'Bounced'];
        const { data: followups } = await supabase
          .from('buyers')
          .select('id, company_name, contact_name, tier, last_sent_at, next_followup_at, contact_email, region, status')
          .not('next_followup_at', 'is', null)
          .lte('next_followup_at', tomorrowEndUtc)
          .not('status', 'in', `(${excludeStatuses.join(',')})`)
          .order('next_followup_at', { ascending: true });

        if (followups && followups.length > 0) {
          const mapped: FollowupBuyer[] = followups.map((b) => {
            const followupTime = new Date(b.next_followup_at).getTime();
            const todayStartTime = new Date(todayStartUtc).getTime();
            const todayEndTime = new Date(todayEndUtc).getTime();

            let badge: 'overdue' | 'today' | 'tomorrow';
            if (followupTime < todayStartTime) {
              badge = 'overdue';
            } else if (followupTime <= todayEndTime) {
              badge = 'today';
            } else {
              badge = 'tomorrow';
            }

            return {
              id: b.id,
              company_name: b.company_name || '',
              contact_name: b.contact_name || '담당자',
              tier: b.tier || '',
              last_sent_at: b.last_sent_at,
              next_followup_at: b.next_followup_at,
              contact_email: b.contact_email || '',
              region: b.region || '',
              status: b.status || '',
              badge,
            };
          });
          setFollowupBuyers(mapped);
        }

      } catch (err) {
        console.error('Dashboard error:', err);
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, []);

  const maxChart = Math.max(...chartData.map((d) => Math.max(d.gcc, d.usa, d.europe)), 1);

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto h-full flex items-center justify-center">
        <div className="text-[#64748b] text-sm">대시보드 로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto h-full">
      <div className="p-6 space-y-6">

        {/* Alert Banner — only if low reply rate team exists and not dismissed */}
        {alertTeam && !alertDismissed && (
          <div className="bg-[#7f1d1d]/20 border border-[#ef4444]/25 rounded-xl p-4 flex items-start gap-3">
            <span className="text-xl flex-shrink-0">⚠️</span>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-[#fca5a5] text-sm">KPI 경고: {alertTeam} 팀 회신율 저조</div>
              <p className="text-xs text-[#fca5a5] mt-1">
                {alertTeam} 팀 회신율이 목표(10%) 미달입니다. 이메일 제목 A/B 테스트 및 개인화 강화를 권장합니다.
              </p>
            </div>
            <button
              onClick={() => setAlertDismissed(true)}
              className="text-xs text-[#e2e8f0] px-3 py-1 bg-[#334155] rounded hover:bg-[#475569] transition whitespace-nowrap flex-shrink-0"
            >
              닫기
            </button>
          </div>
        )}

        {/* No alert if all good */}
        {!alertTeam && !loading && (
          <div className="bg-[#14532d]/20 border border-[#16a34a]/25 rounded-xl p-4 flex items-start gap-3">
            <span className="text-xl flex-shrink-0">✅</span>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-[#4ade80] text-sm">모든 팀 KPI 정상</div>
              <p className="text-xs text-[#4ade80] mt-1">현재 등록된 회신 데이터 기준으로 모든 지표가 목표 범위 내에 있습니다.</p>
            </div>
          </div>
        )}

        {/* Bounce Alert — 바운스율 5% 초과 시 */}
        {bounceAlert && (
          <div className="bg-[#7f1d1d]/20 border border-[#ef4444]/25 rounded-xl p-4 flex items-start gap-3">
            <span className="text-xl flex-shrink-0">🚨</span>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-[#fca5a5] text-sm">바운스율 경고: {bounceRate}%</div>
              <p className="text-xs text-[#fca5a5] mt-1">
                바운스율이 5%를 초과했습니다. 이메일 리스트 점검이 필요합니다. 잘못된 이메일 주소가 있는지 바이어 DB를 확인하세요.
              </p>
            </div>
          </div>
        )}

        {/* North Star Metric — 이번 주 긍정 회신 (가장 중요한 단일 지표) */}
        <div className="bg-gradient-to-r from-[#1e3a5f] to-[#1e293b] border border-[#3b82f6]/30 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-[#60a5fa] font-semibold uppercase tracking-wide">North Star — 이번 주 긍정 회신</div>
              <div className="text-4xl font-bold text-[#f1f5f9] mt-2">{northStar}<span className="text-lg text-[#64748b] ml-1">건</span></div>
              <div className="text-xs text-[#64748b] mt-2">목표: 주 2건 이상 (Interested / Sample / Deal)</div>
            </div>
            <div className={`text-5xl ${northStar >= 2 ? '' : 'opacity-30'}`}>
              {northStar >= 2 ? '🎯' : '🎯'}
            </div>
          </div>
          {northStar >= 2 ? (
            <div className="text-xs text-[#22c55e] mt-3 font-semibold">✓ 이번 주 목표 달성!</div>
          ) : (
            <div className="text-xs text-[#f59e0b] mt-3">목표까지 {Math.max(2 - northStar, 0)}건 남음</div>
          )}
        </div>

        {/* KPI Cards */}
        {kpi && (
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-5">
              <div className="text-xs text-[#64748b] font-semibold uppercase tracking-wide">이번 주 발송</div>
              <div className="text-3xl font-bold text-[#3b82f6] mt-2">{kpi.sent}통</div>
              <div className="text-xs text-[#22c55e] mt-2">
                <span className="text-[#64748b]">전체 발송: </span>{kpi.total_sent}통
              </div>
              <div className="h-1 bg-[#334155] rounded mt-4 overflow-hidden">
                <div className="h-full bg-[#3b82f6]" style={{ width: `${Math.min((kpi.sent / 15) * 100, 100)}%` }} />
              </div>
            </div>

            <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-5">
              <div className="text-xs text-[#64748b] font-semibold uppercase tracking-wide">비반송율</div>
              <div className={`text-3xl font-bold mt-2 ${kpi.total_sent > 0 ? (kpi.deliveryRate >= 97 ? 'text-[#22c55e]' : 'text-[#f59e0b]') : 'text-[#64748b]'}`}>
                {kpi.total_sent > 0 ? `${kpi.deliveryRate}%` : '—'}
              </div>
              <div className="text-xs mt-2 text-[#64748b]">
                {kpi.total_sent > 0
                  ? (kpi.deliveryRate >= 97 ? '✓ 목표 초과' : '▼ 주의')
                  : '발송 후 자동 계산'}
                <span className="text-[#64748b]"> (기준: 97%)</span>
              </div>
              <div className="h-1 bg-[#334155] rounded mt-4 overflow-hidden">
                <div className={`h-full ${kpi.deliveryRate >= 97 ? 'bg-[#22c55e]' : 'bg-[#f59e0b]'}`} style={{ width: `${Math.min(kpi.deliveryRate, 100)}%` }} />
              </div>
            </div>

            <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-5">
              <div className="text-xs text-[#64748b] font-semibold uppercase tracking-wide">열람율</div>
              <div className="text-3xl font-bold mt-2 text-[#64748b]">—</div>
              <div className="text-xs mt-2 text-[#64748b]">
                추적 미설정 <span className="text-[#64748b]">(기준: 45%)</span>
              </div>
              <div className="h-1 bg-[#334155] rounded mt-4 overflow-hidden">
                <div className="h-full bg-[#334155]" style={{ width: '0%' }} />
              </div>
            </div>

            <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-5">
              <div className="text-xs text-[#64748b] font-semibold uppercase tracking-wide">회신율</div>
              <div className={`text-3xl font-bold mt-2 ${kpi.replyRate >= 10 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
                {kpi.replyRate > 0 ? `${kpi.replyRate}%` : '0%'}
              </div>
              <div className={`text-xs mt-2 ${kpi.replyRate >= 10 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
                {kpi.replyRate >= 10 ? '✓ 목표 달성' : '▼ 목표 미달'}
                <span className="text-[#64748b]"> (기준: 10%) · 실제 {kpi.replied}건</span>
              </div>
              <div className="h-1 bg-[#334155] rounded mt-4 overflow-hidden">
                <div
                  className={`h-full ${kpi.replyRate >= 10 ? 'bg-[#22c55e]' : 'bg-[#ef4444]'}`}
                  style={{ width: `${Math.min(kpi.replyRate * 5, 100)}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* 팔로업 대기 목록 — 건수가 0이면 안 보임 */}
        {followupBuyers.length > 0 ? (
          <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-lg">📋</span>
              <div className="text-sm font-semibold text-[#f1f5f9]">
                팔로업 필요 ({followupBuyers.length}건)
              </div>
            </div>
            <div className="space-y-2 max-h-[320px] overflow-y-auto">
              {followupBuyers.map((buyer) => {
                // 배지 스타일 결정
                const badgeConfig = {
                  overdue: { label: '긴급', className: 'bg-[#ef4444]/20 text-[#ef4444]' },
                  today: { label: '오늘', className: 'bg-[#f59e0b]/20 text-[#f59e0b]' },
                  tomorrow: { label: '내일', className: 'bg-[#64748b]/20 text-[#94a3b8]' },
                }[buyer.badge];

                // 날짜 포맷: M/D
                const formatDate = (dateStr: string | null) => {
                  if (!dateStr) return '—';
                  const d = new Date(dateStr);
                  return `${d.getMonth() + 1}/${d.getDate()}`;
                };

                // Tier 배지 색상
                const tierColor = buyer.tier === 'Tier1'
                  ? 'bg-[#22c55e]/20 text-[#22c55e]'
                  : buyer.tier === 'Tier2'
                    ? 'bg-[#f59e0b]/20 text-[#f59e0b]'
                    : 'bg-[#64748b]/20 text-[#94a3b8]';

                return (
                  <div
                    key={buyer.id}
                    className="flex items-center gap-3 p-3 bg-[#0f172a] rounded-lg border border-[#334155] hover:border-[#3b82f6]/50 transition"
                  >
                    {/* 긴급/오늘/내일 배지 */}
                    <span className={`text-xs px-2 py-0.5 rounded font-semibold whitespace-nowrap flex-shrink-0 ${badgeConfig.className}`}>
                      {badgeConfig.label}
                    </span>

                    {/* 회사명 */}
                    <span className="text-xs font-semibold text-[#f1f5f9] truncate min-w-0 max-w-[140px]">
                      {buyer.company_name}
                    </span>

                    {/* 구분선 */}
                    <span className="text-[#334155]">|</span>

                    {/* 담당자명 */}
                    <span className="text-xs text-[#94a3b8] truncate min-w-0 max-w-[80px]">
                      {buyer.contact_name}
                    </span>

                    {/* Tier 배지 */}
                    <span className={`text-xs px-1.5 py-0.5 rounded font-semibold whitespace-nowrap flex-shrink-0 ${tierColor}`}>
                      {buyer.tier}
                    </span>

                    {/* 마지막 발송 / 팔로업 예정 */}
                    <span className="text-xs text-[#64748b] whitespace-nowrap flex-shrink-0">
                      마지막 발송: {formatDate(buyer.last_sent_at)}
                    </span>
                    <span className="text-xs text-[#64748b] whitespace-nowrap flex-shrink-0">
                      팔로업 예정: {formatDate(buyer.next_followup_at)}
                    </span>

                    {/* 메일 작성 버튼 */}
                    {/* TODO: EmailComposeModal 연결 — Dashboard에 모달 상태 추가 후 onEmailClick(buyer) 구현 필요 */}
                    <button
                      onClick={() => {
                        // TODO: EmailComposeModal 열기 (buyer 정보 전달)
                        // setEmailTarget({ id: buyer.id, company: buyer.company_name, contact: buyer.contact_name, email: buyer.contact_email, region: buyer.region, tier: buyer.tier, status: buyer.status });
                        console.log('팔로업 메일 작성:', buyer.company_name, buyer.contact_name);
                      }}
                      className="ml-auto text-xs px-3 py-1.5 bg-[#3b82f6]/20 text-[#3b82f6] rounded hover:bg-[#3b82f6]/30 transition whitespace-nowrap flex-shrink-0 font-semibold"
                    >
                      메일 작성
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          !loading && (
            <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-4 flex items-center gap-2">
              <span className="text-sm">✅</span>
              <span className="text-xs text-[#64748b]">팔로업 대기 없음</span>
            </div>
          )
        )}

        {/* Charts Section */}
        <div className="grid grid-cols-3 gap-4">
          {/* Bar Chart */}
          <div className="col-span-2 bg-[#1e293b] border border-[#334155] rounded-lg p-5">
            <div className="flex justify-between items-start mb-6">
              <div>
                <div className="text-sm font-semibold text-[#f1f5f9]">팀별 일일 발송 추이 (최근 7일)</div>
                <div className="text-xs text-[#64748b] mt-1">GCC · USA · Europe — last_sent_at 기준</div>
              </div>
            </div>

            <div className="h-72 flex items-end justify-around gap-1 pt-8">
              {chartData.map((item, idx) => (
                <div key={idx} className="flex flex-col items-center flex-1 gap-2">
                  <div className="flex gap-0.5 items-end justify-center h-40">
                    <div
                      className="bg-[#3b82f6] rounded-sm"
                      style={{ width: '8px', height: `${Math.max((item.gcc / maxChart) * 140, item.gcc > 0 ? 4 : 0)}px` }}
                      title={`GCC: ${item.gcc}`}
                    />
                    <div
                      className="bg-[#7c3aed] rounded-sm"
                      style={{ width: '8px', height: `${Math.max((item.usa / maxChart) * 140, item.usa > 0 ? 4 : 0)}px` }}
                      title={`USA: ${item.usa}`}
                    />
                    <div
                      className="bg-[#0891b2] rounded-sm"
                      style={{ width: '8px', height: `${Math.max((item.europe / maxChart) * 140, item.europe > 0 ? 4 : 0)}px` }}
                      title={`Europe: ${item.europe}`}
                    />
                  </div>
                  <div className="text-xs text-[#64748b]">{item.date}</div>
                </div>
              ))}
            </div>

            {chartData.every((d) => d.gcc === 0 && d.usa === 0 && d.europe === 0) && (
              <div className="text-center text-xs text-[#475569] mt-2">
                최근 7일 내 발송 데이터가 없습니다. 이메일 발송 후 업데이트됩니다.
              </div>
            )}

            <div className="flex justify-center gap-6 mt-6 text-xs">
              <div className="flex items-center gap-2"><div className="w-3 h-3 bg-[#3b82f6] rounded-sm" /><span className="text-[#e2e8f0]">GCC</span></div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 bg-[#7c3aed] rounded-sm" /><span className="text-[#e2e8f0]">USA</span></div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 bg-[#0891b2] rounded-sm" /><span className="text-[#e2e8f0]">Europe</span></div>
            </div>
          </div>

          {/* Recent Replies */}
          <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-5">
            <div className="text-sm font-semibold text-[#f1f5f9] mb-4">최근 회신</div>
            {recentReplies.length === 0 ? (
              <div className="text-xs text-[#64748b] italic text-center py-8">
                아직 회신받은 바이어가 없습니다.
              </div>
            ) : (
              <div className="space-y-3">
                {recentReplies.map((reply, idx) => (
                  <div key={idx} className="pb-3 border-b border-[#334155] last:border-b-0">
                    <div className="flex items-start gap-2.5 mb-2">
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                        style={{
                          backgroundImage: `linear-gradient(135deg, ${['#3b82f6','#7c3aed','#0891b2','#f59e0b'][idx % 4]}, ${['#2563eb','#6d28d9','#0e7490','#d97706'][idx % 4]})`,
                          color: 'white',
                        }}
                      >
                        {reply.from[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-[#f1f5f9]">{reply.from}</div>
                        <div className="text-xs text-[#64748b]">{reply.company}</div>
                      </div>
                      <span className="bg-[#22c55e]/20 text-[#22c55e] text-xs px-2 py-0.5 rounded whitespace-nowrap flex-shrink-0">
                        {reply.tag}
                      </span>
                    </div>
                    <div className="text-xs text-[#94a3b8] line-clamp-2">{reply.preview}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 시스템 경고 배너 (직원 F) */}
        {systemWarnings.length > 0 && (
          <div className="p-4 rounded-lg border bg-[#f59e0b]/10 border-[#f59e0b]/30">
            <div className="text-sm font-semibold text-[#f59e0b] mb-2">⚠️ 시스템 경고 (직원 F)</div>
            {systemWarnings.map((w, i) => (
              <div key={i} className="text-xs text-[#fbbf24] mt-1">• {w}</div>
            ))}
          </div>
        )}

        {/* 오늘 파이프라인 결과 */}
        <div className="grid grid-cols-5 gap-4">
          <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-4 text-center">
            <div className="text-xs text-[#64748b] font-semibold">오늘 발굴 기업</div>
            <div className="text-2xl font-bold text-[#3b82f6] mt-2">{todayStats.companies}</div>
          </div>
          <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-4 text-center">
            <div className="text-xs text-[#64748b] font-semibold">오늘 발굴 담당자</div>
            <div className="text-2xl font-bold text-[#8b5cf6] mt-2">{todayStats.contacts}</div>
          </div>
          <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-4 text-center">
            <div className="text-xs text-[#64748b] font-semibold">Tier 1</div>
            <div className="text-2xl font-bold text-[#22c55e] mt-2">{todayStats.tier1}</div>
          </div>
          <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-4 text-center">
            <div className="text-xs text-[#64748b] font-semibold">Tier 2</div>
            <div className="text-2xl font-bold text-[#f59e0b] mt-2">{todayStats.tier2}</div>
          </div>
          <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-4 text-center">
            <div className="text-xs text-[#64748b] font-semibold">Tier 3 (저장만)</div>
            <div className="text-2xl font-bold text-[#64748b] mt-2">{todayStats.tier3}</div>
          </div>
        </div>

        {/* Team Status Table */}
        <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm font-semibold text-[#f1f5f9]">팀별 현황</div>
              <div className="text-xs text-[#64748b] mt-0.5">바이어 DB 기준 실시간 집계</div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#334155]">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748b]">팀</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-[#64748b]">발송</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-[#64748b]">전달율</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-[#64748b]">회신율</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-[#64748b]">신규 리드</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-[#64748b]">상태</th>
                </tr>
              </thead>
              <tbody>
                {teamStats.map((row, idx) => (
                  <tr key={idx} className="border-b border-[#334155] hover:bg-[#273549]">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-[#f1f5f9]">
                        <span className="text-lg mr-2">{row.flag}</span>
                        {row.region}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-[#f1f5f9]">{row.sent}통</td>
                    <td className="px-4 py-3 text-center text-[#94a3b8] font-semibold">{row.sent > 0 ? `${Math.round(((row.sent) / Math.max(row.sent, 1)) * 100)}%` : '—'}</td>
                    <td className={`px-4 py-3 text-center font-semibold ${parseFloat(row.replyRate) >= 10 ? 'text-[#22c55e]' : parseFloat(row.replyRate) >= 5 ? 'text-[#f59e0b]' : 'text-[#ef4444]'}`}>
                      {row.replyRate}
                      {parseFloat(row.replyRate) < 10 && row.sent > 0 ? ' ▼' : ''}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs bg-[#22c55e]/20 text-[#22c55e] px-2 py-1 rounded">
                        {row.leads} 리드
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-1 rounded ${row.statusColor}`}>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 이메일 초안 목록 */}
        {emailDrafts.length > 0 && (
          <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-sm font-semibold text-[#f1f5f9]">이메일 초안 목록</div>
                <div className="text-xs text-[#64748b] mt-0.5">{emailDrafts.length}개 초안 준비됨</div>
              </div>
              {flaggedDrafts.length > 0 && (
                <span className="bg-[#ef4444]/20 text-[#ef4444] text-xs px-3 py-1 rounded font-semibold">
                  {flaggedDrafts.length}개 검토 필요
                </span>
              )}
            </div>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {emailDrafts.map((draft) => (
                <button
                  key={draft.id}
                  onClick={() => setPreviewDraft(previewDraft?.id === draft.id ? null : draft)}
                  className="w-full text-left p-3 bg-[#0f172a] rounded-lg border border-[#334155] hover:border-[#3b82f6]/50 transition"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-[#f1f5f9]">{draft.contact_name}</span>
                      <span className="text-xs text-[#64748b]">@ {draft.company_name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded font-semibold ${
                        draft.tier === 'Tier1' ? 'bg-[#22c55e]/20 text-[#22c55e]' : 'bg-[#f59e0b]/20 text-[#f59e0b]'
                      }`}>
                        {draft.tier}
                      </span>
                      {draft.spam_status === 'pass' && (
                        <span className="text-xs bg-[#22c55e]/20 text-[#22c55e] px-2 py-0.5 rounded">
                          스팸통과
                        </span>
                      )}
                      {draft.spam_score && (
                        <span className="text-xs text-[#64748b]">{draft.spam_score}점</span>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-[#94a3b8] space-y-0.5">
                    <div>1: {draft.subject_line_1}</div>
                    <div>2: {draft.subject_line_2}</div>
                    <div>3: {draft.subject_line_3}</div>
                  </div>

                  {/* 본문 미리보기 */}
                  {previewDraft?.id === draft.id && (
                    <div className="mt-3 p-3 bg-[#1e293b] rounded border border-[#334155]">
                      <div className="text-xs font-semibold text-[#3b82f6] mb-2">1차 콜드메일</div>
                      <div className="text-xs text-[#94a3b8] whitespace-pre-wrap mb-3">{draft.body_first}</div>
                      <div className="text-xs font-semibold text-[#8b5cf6] mb-2">2차 팔로업</div>
                      <div className="text-xs text-[#94a3b8] whitespace-pre-wrap">{draft.body_followup}</div>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Flag 항목 (검토 필요) */}
        {flaggedDrafts.length > 0 && (
          <div className="bg-[#1e293b] border border-[#ef4444]/30 rounded-lg p-5">
            <div className="text-sm font-semibold text-[#ef4444] mb-3">
              검토 필요 (스팸 점수 미달) — {flaggedDrafts.length}건
            </div>
            <div className="space-y-2">
              {flaggedDrafts.map((draft) => (
                <div key={draft.id} className="p-3 bg-[#0f172a] rounded-lg border border-[#ef4444]/20">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-[#f1f5f9]">
                      {draft.contact_name} @ {draft.company_name}
                    </span>
                    <span className="text-xs bg-[#ef4444]/20 text-[#ef4444] px-2 py-0.5 rounded font-semibold">
                      스팸점수: {draft.spam_score}
                    </span>
                  </div>
                  <div className="text-xs text-[#94a3b8]">{draft.subject_line_1}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pending Intel 항목 */}
        {pendingIntelDrafts.length > 0 && (
          <div className="bg-[#1e293b] border border-[#f59e0b]/30 rounded-lg p-5">
            <div className="text-sm font-semibold text-[#f59e0b] mb-3">
              인텔 데이터 필요 — {pendingIntelDrafts.length}건
            </div>
            <div className="text-xs text-[#fbbf24] mb-3">
              파이프라인 실행 후 재시도하면 자동으로 초안이 생성됩니다.
            </div>
            <div className="space-y-2">
              {pendingIntelDrafts.map((draft) => (
                <div key={draft.id} className="p-3 bg-[#0f172a] rounded-lg border border-[#f59e0b]/20">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#f1f5f9]">
                      {draft.contact_name} @ {draft.company_name}
                    </span>
                    <span className="text-xs bg-[#f59e0b]/20 text-[#f59e0b] px-2 py-0.5 rounded font-semibold">
                      인텔 대기
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
