'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { AlertTriangle, Target, Check, ClipboardList, CheckCircle } from 'lucide-react';
import InterestedLeadsWidget from './InterestedLeadsWidget';
import EmailComposeModal from './EmailComposeModal';

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
// PR17.2(ADR-044): "오늘 보낼 메일" 페이지 제거 → 팔로업 기능을 Dashboard로 흡수.
//   MailQueue에 있던 buyer_contacts JOIN 기반 per-contact flatten 로직도 동일하게 적용.
interface FollowupBuyer {
  id: string;                  // buyers.id
  company_name: string;
  contact_name: string;
  tier: string;
  last_sent_at: string | null;
  next_followup_at: string;
  contact_email: string;
  region: string;
  status: string;
  email_count: number;
  contact_id?: string;         // buyer_contacts.id — legacy(없음)는 buyer 본체 contact_name 폴백
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

interface DashboardProps {
  onNavigate?: (page: string) => void;
}

export default function Dashboard({ onNavigate }: DashboardProps = {}) {
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
  const [systemWarnings, setSystemWarnings] = useState<string[]>([]);
  // 팔로업 대기 목록
  const [followupBuyers, setFollowupBuyers] = useState<FollowupBuyer[]>([]);
  // PR17.2: EmailComposeModal 직접 연결 (이전엔 MailQueue 페이지 경유)
  const [selectedBuyer, setSelectedBuyer] = useState<Record<string, unknown> | null>(null);
  const [emailModalOpen, setEmailModalOpen] = useState(false);

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

          let statusLabel = '정상';
          let statusColor = 'bg-[#22c55e]/20 text-[#22c55e]';
          if (rate < 5 && regionSent.length > 0) {
            statusLabel = '경고';
            statusColor = 'bg-[#ef4444]/20 text-[#ef4444]';
          } else if (rate < 10 && regionSent.length > 0) {
            statusLabel = '주의';
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
          (s) => s.status === '경고' || (s.sent > 0 && parseFloat(s.replyRate) < 10)
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

        // PR18(ADR-045): 배치 email_drafts 목록 섹션 제거 — 초안은 Buyers DB 페이지 수동 경로로만 생성.

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

        // PR17.2(ADR-044): buyers 단독 → buyer_contacts JOIN. 담당자 여러 명이면 각자 row로 flatten.
        //   확정 상태 contact(Replied/Deal/Lost/Bounced)는 제외.
        const excludeStatuses = ['Lost', 'Deal', 'Bounced', 'intel_failed'];
        const excludeContactStatuses = new Set(['Replied', 'Deal', 'Lost', 'Bounced']);
        const { data: followups } = await supabase
          .from('buyers')
          .select(`
            id, company_name, contact_name, tier, last_sent_at, next_followup_at,
            contact_email, region, status, email_count,
            buyer_contacts ( id, contact_name, contact_email, contact_status )
          `)
          .not('next_followup_at', 'is', null)
          .lte('next_followup_at', tomorrowEndUtc)
          .not('status', 'in', `(${excludeStatuses.join(',')})`)
          .order('next_followup_at', { ascending: true });

        if (followups && followups.length > 0) {
          const todayStartTime = new Date(todayStartUtc).getTime();
          const todayEndTime = new Date(todayEndUtc).getTime();
          const flattened: FollowupBuyer[] = [];

          for (const b of followups as Array<Record<string, unknown>>) {
            const followupTime = new Date(b.next_followup_at as string).getTime();
            let badge: 'overdue' | 'today' | 'tomorrow';
            if (followupTime < todayStartTime) badge = 'overdue';
            else if (followupTime <= todayEndTime) badge = 'today';
            else badge = 'tomorrow';

            const contacts = (b.buyer_contacts as Array<{
              id: string;
              contact_name: string | null;
              contact_email: string | null;
              contact_status: string | null;
            }> | null) ?? [];

            const base = {
              id: b.id as string,
              company_name: (b.company_name as string) || '',
              tier: (b.tier as string) || '',
              last_sent_at: (b.last_sent_at as string | null) ?? null,
              next_followup_at: b.next_followup_at as string,
              region: (b.region as string) || '',
              status: (b.status as string) || '',
              email_count: (b.email_count as number | null) ?? 0,
              badge,
            };

            if (contacts.length === 0) {
              // legacy: buyer_contacts 없는 구 데이터 → buyers 본체 필드 폴백 (contact_id 없음)
              flattened.push({
                ...base,
                contact_name: (b.contact_name as string) || '담당자',
                contact_email: (b.contact_email as string) || '',
              });
              continue;
            }

            for (const c of contacts) {
              if (c.contact_status && excludeContactStatuses.has(c.contact_status)) continue;
              flattened.push({
                ...base,
                contact_name: c.contact_name || '담당자',
                contact_email: c.contact_email || '',
                contact_id: c.id,
              });
            }
          }

          setFollowupBuyers(flattened);
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
        <div className="text-[#8792a2] text-sm">대시보드 로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto h-full">
      <div className="p-6 space-y-6">

        {/* KPI 경고 배너 — 라이트 톤 red (다크 테마 잔재 제거) */}
        {alertTeam && !alertDismissed && (
          <div className="bg-[#fef2f2] border border-[#fecaca] rounded-lg p-4 flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-[#fee2e2] flex items-center justify-center flex-shrink-0">
              <AlertTriangle size={16} className="text-[#b91c1c]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-[#1a1f36] text-sm">KPI 경고: {alertTeam} 팀 회신율 저조</div>
              <p className="text-xs text-[#697386] mt-1 leading-relaxed">
                {alertTeam} 팀 회신율이 목표(10%) 미달입니다. 이메일 제목 A/B 테스트 및 개인화 강화를 권장합니다.
              </p>
            </div>
            <button
              onClick={() => setAlertDismissed(true)}
              className="text-xs text-[#697386] px-3 py-1 bg-white border border-[#e3e8ee] rounded hover:bg-[#f6f8fa] transition whitespace-nowrap flex-shrink-0"
            >
              닫기
            </button>
          </div>
        )}

        {/* No alert if all good */}
        {!alertTeam && !loading && (
          <div className="bg-[#635BFF10] border border-[#635BFF40] rounded-lg p-3 flex items-center gap-3">
            <CheckCircle size={16} className="text-[#635BFF] flex-shrink-0" />
            <span className="text-xs text-[#635BFF]">
              <strong>모든 팀 KPI 정상</strong> — 현재 등록된 회신 데이터 기준으로 모든 지표가 목표 범위 내에 있습니다.
            </span>
          </div>
        )}

        {/* Bounce Alert — 바운스율 5% 초과 시 */}
        {bounceAlert && (
          <div className="bg-[#ef444410] border border-[#ef444440] rounded-lg p-3 flex items-center gap-3">
            <AlertTriangle size={16} className="text-[#ef4444] flex-shrink-0" />
            <span className="text-xs text-[#ef4444]">
              <strong>바운스율 경고: {bounceRate}%</strong> — 이메일 리스트 점검이 필요합니다. 바이어 DB에서 잘못된 이메일 주소를 확인하세요.
            </span>
          </div>
        )}

        {/* North Star Metric — 이번 주 긍정 회신 (가장 중요한 단일 지표) */}
        <div className="bg-gradient-to-r from-[#f0f0ff] to-[#ffffff] border border-[#635BFF]/30 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-[#7A73FF] font-semibold uppercase tracking-wide">North Star — 이번 주 긍정 회신</div>
              <div className="text-4xl font-bold text-[#1a1f36] mt-2">{northStar}<span className="text-lg text-[#8792a2] ml-1">건</span></div>
              <div className="text-xs text-[#8792a2] mt-2">목표: 주 2건 이상 (Interested / Sample / Deal)</div>
            </div>
            <div className={`${northStar >= 2 ? '' : 'opacity-30'}`}>
              <Target size={40} className="inline text-[#635BFF]" />
            </div>
          </div>
          {northStar >= 2 ? (
            <div className="text-xs text-[#22c55e] mt-3 font-semibold"><Check size={14} className="inline" /> 이번 주 목표 달성!</div>
          ) : (
            <div className="text-xs text-[#f59e0b] mt-3">목표까지 {Math.max(2 - northStar, 0)}건 남음</div>
          )}
        </div>

        {/* KPI Cards */}
        {kpi && (
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-[#ffffff] border border-[#e3e8ee] rounded-lg p-5">
              <div className="text-xs text-[#8792a2] font-semibold uppercase tracking-wide">이번 주 발송</div>
              <div className="text-3xl font-bold text-[#635BFF] mt-2">{kpi.sent}통</div>
              <div className="text-xs text-[#22c55e] mt-2">
                <span className="text-[#8792a2]">전체 발송: </span>{kpi.total_sent}통
              </div>
              <div className="h-1 bg-[#e3e8ee] rounded mt-4 overflow-hidden">
                <div className="h-full bg-[#635BFF]" style={{ width: `${Math.min((kpi.sent / 15) * 100, 100)}%` }} />
              </div>
            </div>

            <div className="bg-[#ffffff] border border-[#e3e8ee] rounded-lg p-5">
              <div className="text-xs text-[#8792a2] font-semibold uppercase tracking-wide">비반송율</div>
              <div className={`text-3xl font-bold mt-2 ${kpi.total_sent > 0 ? (kpi.deliveryRate >= 97 ? 'text-[#22c55e]' : 'text-[#f59e0b]') : 'text-[#8792a2]'}`}>
                {kpi.total_sent > 0 ? `${kpi.deliveryRate}%` : '—'}
              </div>
              <div className="text-xs mt-2 text-[#8792a2]">
                {kpi.total_sent > 0
                  ? (kpi.deliveryRate >= 97 ? <><Check size={14} className="inline" /> 목표 초과</> : '▼ 주의')
                  : '발송 후 자동 계산'}
                <span className="text-[#8792a2]"> (기준: 97%)</span>
              </div>
              <div className="h-1 bg-[#e3e8ee] rounded mt-4 overflow-hidden">
                <div className={`h-full ${kpi.deliveryRate >= 97 ? 'bg-[#22c55e]' : 'bg-[#f59e0b]'}`} style={{ width: `${Math.min(kpi.deliveryRate, 100)}%` }} />
              </div>
            </div>

            <div className="bg-[#ffffff] border border-[#e3e8ee] rounded-lg p-5">
              <div className="text-xs text-[#8792a2] font-semibold uppercase tracking-wide">열람율</div>
              <div className="text-3xl font-bold mt-2 text-[#8792a2]">—</div>
              <div className="text-xs mt-2 text-[#8792a2]">
                추적 미설정 <span className="text-[#8792a2]">(기준: 45%)</span>
              </div>
              <div className="h-1 bg-[#e3e8ee] rounded mt-4 overflow-hidden">
                <div className="h-full bg-[#e3e8ee]" style={{ width: '0%' }} />
              </div>
            </div>

            <div className="bg-[#ffffff] border border-[#e3e8ee] rounded-lg p-5">
              <div className="text-xs text-[#8792a2] font-semibold uppercase tracking-wide">회신율</div>
              <div className={`text-3xl font-bold mt-2 ${kpi.replyRate >= 10 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
                {kpi.replyRate > 0 ? `${kpi.replyRate}%` : '0%'}
              </div>
              <div className={`text-xs mt-2 ${kpi.replyRate >= 10 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
                {kpi.replyRate >= 10 ? <><Check size={14} className="inline" /> 목표 달성</> : '▼ 목표 미달'}
                <span className="text-[#8792a2]"> (기준: 10%) · 실제 {kpi.replied}건</span>
              </div>
              <div className="h-1 bg-[#e3e8ee] rounded mt-4 overflow-hidden">
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
          <div className="bg-[#ffffff] border border-[#e3e8ee] rounded-lg p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-lg"><ClipboardList size={16} className="inline text-[#697386]" /></span>
              <div className="text-sm font-semibold text-[#1a1f36]">
                팔로업 필요 ({followupBuyers.length}건)
              </div>
            </div>
            <div className="space-y-2 max-h-[320px] overflow-y-auto">
              {followupBuyers.map((buyer) => {
                // 배지 스타일 결정
                const badgeConfig = {
                  overdue: { label: '긴급', className: 'bg-[#ef4444]/20 text-[#ef4444]' },
                  today: { label: '오늘', className: 'bg-[#f59e0b]/20 text-[#f59e0b]' },
                  tomorrow: { label: '내일', className: 'bg-[#8792a2]/20 text-[#697386]' },
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
                    : 'bg-[#8792a2]/20 text-[#697386]';

                return (
                  <div
                    key={buyer.contact_id ?? `buyer-${buyer.id}`}
                    className="flex items-center gap-3 p-3 bg-[#f6f8fa] rounded-lg border border-[#e3e8ee] hover:border-[#635BFF]/50 transition"
                  >
                    {/* 긴급/오늘/내일 배지 */}
                    <span className={`text-xs px-2 py-0.5 rounded font-semibold whitespace-nowrap flex-shrink-0 ${badgeConfig.className}`}>
                      {badgeConfig.label}
                    </span>

                    {/* 회사명 */}
                    <span className="text-xs font-semibold text-[#1a1f36] truncate min-w-0 max-w-[140px]">
                      {buyer.company_name}
                    </span>

                    {/* 구분선 */}
                    <span className="text-[#e3e8ee]">|</span>

                    {/* 담당자명 */}
                    <span className="text-xs text-[#697386] truncate min-w-0 max-w-[80px]">
                      {buyer.contact_name}
                    </span>

                    {/* Tier 배지 */}
                    <span className={`text-xs px-1.5 py-0.5 rounded font-semibold whitespace-nowrap flex-shrink-0 ${tierColor}`}>
                      {buyer.tier}
                    </span>

                    {/* 마지막 발송 / 팔로업 예정 */}
                    <span className="text-xs text-[#8792a2] whitespace-nowrap flex-shrink-0">
                      마지막 발송: {formatDate(buyer.last_sent_at)}
                    </span>
                    <span className="text-xs text-[#8792a2] whitespace-nowrap flex-shrink-0">
                      팔로업 예정: {formatDate(buyer.next_followup_at)}
                    </span>

                    {/* PR19(ADR-047): email_count 기반 5단계 컬러 계단 — Buyers.tsx와 동일 규칙 */}
                    {(() => {
                      const count = buyer.email_count ?? 0;
                      const label =
                        count === 0 ? '첫 발송'
                        : count === 1 ? '1차 팔로업'
                        : count === 2 ? '2차 팔로업'
                        : count === 3 ? '3차 팔로업'
                        : '보관';
                      const color =
                        count === 0 ? 'bg-[#8792a2]/10 text-[#697386] hover:bg-[#8792a2]/20'
                        : count === 1 ? 'bg-[#f59e0b]/20 text-[#f59e0b] hover:bg-[#f59e0b]/30'
                        : count === 2 ? 'bg-[#22c55e]/20 text-[#22c55e] hover:bg-[#22c55e]/30'
                        : count === 3 ? 'bg-[#ef4444]/20 text-[#ef4444] hover:bg-[#ef4444]/30'
                        : 'bg-[#ef4444]/10 text-[#ef4444] opacity-60 cursor-not-allowed';
                      const disabled = count >= 4;
                      return (
                        <button
                          onClick={() => {
                            setSelectedBuyer({
                              id: buyer.id,
                              company: buyer.company_name,
                              contact: buyer.contact_name,
                              email: buyer.contact_email,
                              region: buyer.region,
                              tier: buyer.tier,
                              status: buyer.status,
                              email_count: buyer.email_count,
                              contact_id: buyer.contact_id,
                            });
                            setEmailModalOpen(true);
                          }}
                          disabled={disabled}
                          title={disabled ? '3차 팔로업 완료. 더 이상 발송하지 않음.' : undefined}
                          className={`ml-auto text-xs px-3 py-1.5 rounded transition whitespace-nowrap flex-shrink-0 font-semibold ${color}`}
                        >
                          {label}
                        </button>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          !loading && (
            <div className="bg-[#ffffff] border border-[#e3e8ee] rounded-lg p-4 flex items-center gap-2">
              <CheckCircle size={16} className="text-[#22c55e]" />
              <span className="text-xs text-[#8792a2]">팔로업 대기 없음</span>
            </div>
          )
        )}

        {/* Charts Section */}
        <div className="grid grid-cols-3 gap-4">
          {/* Bar Chart */}
          <div className="col-span-2 bg-[#ffffff] border border-[#e3e8ee] rounded-lg p-5">
            <div className="flex justify-between items-start mb-6">
              <div>
                <div className="text-sm font-semibold text-[#1a1f36]">팀별 일일 발송 추이 (최근 7일)</div>
                <div className="text-xs text-[#8792a2] mt-1">GCC · USA · Europe — last_sent_at 기준</div>
              </div>
            </div>

            <div className="h-72 flex items-end justify-around gap-1 pt-8">
              {chartData.map((item, idx) => (
                <div key={idx} className="flex flex-col items-center flex-1 gap-2">
                  <div className="flex gap-0.5 items-end justify-center h-40">
                    <div
                      className="bg-[#635BFF] rounded-sm"
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
                  <div className="text-xs text-[#8792a2]">{item.date}</div>
                </div>
              ))}
            </div>

            {chartData.every((d) => d.gcc === 0 && d.usa === 0 && d.europe === 0) && (
              <div className="text-center text-xs text-[#8792a2] mt-2">
                최근 7일 내 발송 데이터가 없습니다. 이메일 발송 후 업데이트됩니다.
              </div>
            )}

            <div className="flex justify-center gap-6 mt-6 text-xs">
              <div className="flex items-center gap-2"><div className="w-3 h-3 bg-[#635BFF] rounded-sm" /><span className="text-[#1a1f36]">GCC</span></div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 bg-[#7c3aed] rounded-sm" /><span className="text-[#1a1f36]">USA</span></div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 bg-[#0891b2] rounded-sm" /><span className="text-[#1a1f36]">Europe</span></div>
            </div>
          </div>

          {/* Recent Replies */}
          <div className="bg-[#ffffff] border border-[#e3e8ee] rounded-lg p-5">
            <div className="text-sm font-semibold text-[#1a1f36] mb-4">최근 회신</div>
            {recentReplies.length === 0 ? (
              <div className="text-xs text-[#8792a2] italic text-center py-8">
                아직 회신받은 바이어가 없습니다.
              </div>
            ) : (
              <div className="space-y-3">
                {recentReplies.map((reply, idx) => (
                  <div key={idx} className="pb-3 border-b border-[#e3e8ee] last:border-b-0">
                    <div className="flex items-start gap-2.5 mb-2">
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                        style={{
                          backgroundImage: `linear-gradient(135deg, ${['#635BFF','#7c3aed','#0891b2','#f59e0b'][idx % 4]}, ${['#5851DB','#6d28d9','#0e7490','#d97706'][idx % 4]})`,
                          color: 'white',
                        }}
                      >
                        {reply.from[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-[#1a1f36]">{reply.from}</div>
                        <div className="text-xs text-[#8792a2]">{reply.company}</div>
                      </div>
                      <span className="bg-[#22c55e]/20 text-[#22c55e] text-xs px-2 py-0.5 rounded whitespace-nowrap flex-shrink-0">
                        {reply.tag}
                      </span>
                    </div>
                    <div className="text-xs text-[#697386] line-clamp-2">{reply.preview}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 시스템 경고 배너 (직원 F) — 라이트 테마 화이트 카드 */}
        {systemWarnings.length > 0 && (
          <div className="bg-white border border-[#e3e8ee] rounded-lg p-3 flex items-start gap-3 shadow-sm">
            <div className="w-7 h-7 rounded-full bg-[#fef3c7] flex items-center justify-center flex-shrink-0">
              <AlertTriangle size={14} className="text-[#b45309]" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-xs font-semibold text-[#1a1f36]">시스템 경고 (직원 F)</span>
              {systemWarnings.map((w, i) => (
                <div key={i} className="text-xs text-[#697386] mt-0.5 leading-relaxed">• {w}</div>
              ))}
            </div>
          </div>
        )}

        {/* 오늘 파이프라인 결과 */}
        <div className="grid grid-cols-5 gap-4">
          <div className="bg-[#ffffff] border border-[#e3e8ee] rounded-lg p-4 text-center">
            <div className="text-xs text-[#8792a2] font-semibold">오늘 발굴 기업</div>
            <div className="text-2xl font-bold text-[#635BFF] mt-2">{todayStats.companies}</div>
          </div>
          <div className="bg-[#ffffff] border border-[#e3e8ee] rounded-lg p-4 text-center">
            <div className="text-xs text-[#8792a2] font-semibold">오늘 발굴 담당자</div>
            <div className="text-2xl font-bold text-[#8b5cf6] mt-2">{todayStats.contacts}</div>
          </div>
          <div className="bg-[#ffffff] border border-[#e3e8ee] rounded-lg p-4 text-center">
            <div className="text-xs text-[#8792a2] font-semibold">Tier 1</div>
            <div className="text-2xl font-bold text-[#22c55e] mt-2">{todayStats.tier1}</div>
          </div>
          <div className="bg-[#ffffff] border border-[#e3e8ee] rounded-lg p-4 text-center">
            <div className="text-xs text-[#8792a2] font-semibold">Tier 2</div>
            <div className="text-2xl font-bold text-[#f59e0b] mt-2">{todayStats.tier2}</div>
          </div>
          <div className="bg-[#ffffff] border border-[#e3e8ee] rounded-lg p-4 text-center">
            <div className="text-xs text-[#8792a2] font-semibold">Tier 3 (저장만)</div>
            <div className="text-2xl font-bold text-[#8792a2] mt-2">{todayStats.tier3}</div>
          </div>
        </div>

        {/* Team Status Table */}
        <div className="bg-[#ffffff] border border-[#e3e8ee] rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm font-semibold text-[#1a1f36]">팀별 현황</div>
              <div className="text-xs text-[#8792a2] mt-0.5">바이어 DB 기준 실시간 집계</div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#e3e8ee]">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#8792a2]">팀</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-[#8792a2]">발송</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-[#8792a2]">전달율</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-[#8792a2]">회신율</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-[#8792a2]">신규 리드</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-[#8792a2]">상태</th>
                </tr>
              </thead>
              <tbody>
                {teamStats.map((row, idx) => (
                  <tr key={idx} className="border-b border-[#e3e8ee] hover:bg-[#f6f8fa]">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-[#1a1f36]">
                        <span className="text-lg mr-2">{row.flag}</span>
                        {row.region}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-[#1a1f36]">{row.sent}통</td>
                    <td className="px-4 py-3 text-center text-[#697386] font-semibold">{row.sent > 0 ? `${Math.round(((row.sent) / Math.max(row.sent, 1)) * 100)}%` : '—'}</td>
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
                        {row.status === '정상' ? <><Check size={14} className="inline" /> {row.status}</> : row.status === '경고' ? <><AlertTriangle size={14} className="inline" /> {row.status}</> : row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* PR13: 오늘의 관심 리드 (72시간 내 P.S. 링크 클릭) */}
        <InterestedLeadsWidget onNavigateBuyers={onNavigate ? () => onNavigate('buyers') : undefined} />

        {/* PR18(ADR-045): '이메일 초안 목록' / '검토 필요' / '인텔 데이터 필요' 3개 섹션 제거.
            초안 생성은 Buyers DB 페이지 수동 경로(EmailComposeModal)로만 진행 → 배치 결과 목록 불필요. */}

      </div>

      {/* PR17.2(ADR-044): 팔로업 "메일 작성" 버튼에서 직접 여는 모달. MailQueue 페이지 제거에 따른 통합. */}
      {selectedBuyer && (
        <EmailComposeModal
          isOpen={emailModalOpen}
          onClose={() => {
            setEmailModalOpen(false);
            setSelectedBuyer(null);
          }}
          onSent={() => {
            // 발송 완료된 담당자만 큐에서 제거. 같은 회사의 다른 담당자는 유지.
            const sentBuyerId = selectedBuyer.id as string;
            const sentContactId = selectedBuyer.contact_id as string | undefined;
            setFollowupBuyers((prev) => prev.filter((f) => !(f.id === sentBuyerId && f.contact_id === sentContactId)));
          }}
          buyer={selectedBuyer as Parameters<typeof EmailComposeModal>[0]['buyer']}
        />
      )}
    </div>
  );
}
