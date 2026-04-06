'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { KPISnapshot } from '../lib/types';

// Fallback mock chart data
const mockChartData = [
  { date: '3/29', gcc: 65, usa: 45, europe: 55 },
  { date: '3/30', gcc: 70, usa: 50, europe: 60 },
  { date: '3/31', gcc: 55, usa: 40, europe: 50 },
  { date: '4/1', gcc: 75, usa: 55, europe: 65 },
  { date: '4/2', gcc: 80, usa: 60, europe: 70 },
  { date: '4/3', gcc: 90, usa: 65, europe: 75 },
  { date: '4/4', gcc: 85, usa: 50, europe: 70 },
];

const mockRecentReplies = [
  { from: 'Maya Berberi', company: 'Basharacare', status: 'opened', time: '2분 전' },
  { from: 'Ahmad Al-Mansouri', company: 'Namshi', status: 'opened', time: '15분 전' },
  { from: 'Fatima Al-Zahra', company: 'Ounass', status: 'replied', time: '1시간 전' },
  { from: 'Mohammed Al-Dosari', company: 'Noon', status: 'replied', time: '2시간 전' },
];

const mockTeamStatus = [
  { team: 'GCC', sent: 180, opened: 142, replied: 24, replyRate: '13.3%' },
  { team: 'USA', sent: 150, opened: 52, replied: 6, replyRate: '4.0%' },
  { team: 'Europe', sent: 120, opened: 80, replied: 14, replyRate: '11.7%' },
];

export default function Dashboard() {
  const [kpiData, setKpiData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [chartData] = useState(mockChartData);
  const [recentReplies] = useState(mockRecentReplies);
  const [teamStatus] = useState(mockTeamStatus);

  useEffect(() => {
    async function fetchKPIData() {
      try {
        const today = new Date().toISOString().split('T')[0];

        const { data, error } = await supabase
          .from('kpi_snapshots')
          .select('*')
          .eq('snapshot_date', today);

        if (error) {
          console.warn('KPI fetch error:', error);
          setKpiData(null);
        } else if (data && data.length > 0) {
          // Calculate aggregated KPI from today's data (all regions)
          const aggregated = {
            emails_sent: data.reduce((sum: number, row: KPISnapshot) => sum + row.emails_sent, 0),
            emails_opened: data.reduce((sum: number, row: KPISnapshot) => sum + row.emails_opened, 0),
            emails_replied: data.reduce((sum: number, row: KPISnapshot) => sum + row.emails_replied, 0),
            emails_bounced: data.reduce((sum: number, row: KPISnapshot) => sum + row.emails_bounced, 0),
          };

          const deliveryRate =
            aggregated.emails_sent > 0
              ? (((aggregated.emails_sent - aggregated.emails_bounced) / aggregated.emails_sent) * 100).toFixed(1)
              : 0;
          const openRate =
            aggregated.emails_sent > 0
              ? (((aggregated.emails_opened / aggregated.emails_sent) * 100).toFixed(1))
              : 0;
          const replyRate =
            aggregated.emails_sent > 0
              ? (((aggregated.emails_replied / aggregated.emails_sent) * 100).toFixed(1))
              : 0;

          setKpiData({
            emails_sent: aggregated.emails_sent,
            delivery_rate: deliveryRate,
            open_rate: openRate,
            reply_rate: replyRate,
          });
        } else {
          setKpiData(null);
        }
      } catch (error) {
        console.error('KPI fetch error:', error);
        setKpiData(null);
      } finally {
        setLoading(false);
      }
    }

    fetchKPIData();
  }, []);

  // Default values for display
  const displayData = kpiData || {
    emails_sent: 73,
    delivery_rate: 98.6,
    open_rate: 38.2,
    reply_rate: 11.8,
  };

  // Calculate USA team reply rate from teamStatus
  const usaTeamData = teamStatus.find((t) => t.team === 'USA');
  const usaReplyRate = usaTeamData ? parseFloat(usaTeamData.replyRate) : 0;
  const showWarning = usaReplyRate < 8;

  return (
    <div className="flex-1 flex flex-col overflow-auto">
      {/* Topbar */}
      <div className="sticky top-0 bg-[#0f172a] border-b border-[#334155] px-8 py-6 flex justify-between items-center z-10">
        <div>
          <h1 className="text-2xl font-bold text-[#f1f5f9]">대시보드</h1>
          <p className="text-sm text-[#94a3b8] mt-1">오늘 현황 · 2026년 4월 6일 월요일</p>
        </div>
        <div className="flex gap-3">
          <button className="px-4 py-2 bg-[#1e293b] border border-[#334155] rounded-lg text-[#e2e8f0] text-sm hover:bg-[#334155] transition">
            ▶ 파이프라인 실행
          </button>
          <button className="px-4 py-2 bg-[#3b82f6] rounded-lg text-white text-sm font-semibold hover:bg-[#2563eb] transition">
            + 바이어 추가
          </button>
          <div className="relative">
            <button className="text-2xl">🔔</button>
            <div className="absolute top-1 right-1 w-2 h-2 bg-[#ef4444] rounded-full"></div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-8 space-y-8">
        {/* Alert Banner - Dynamic */}
        {showWarning && (
          <div className="bg-[#7f1d1d]/20 border border-[#ef4444]/25 rounded-lg p-4 flex items-start gap-3">
            <span className="text-xl">⚠️</span>
            <div className="flex-1">
              <div className="font-semibold text-[#fca5a5] text-sm">KPI 경고: USA 팀 회신율 저조</div>
              <p className="text-xs text-[#fca5a5] mt-1">
                이번 주 USA 팀 Tier 1 회신율 {usaReplyRate}% — 목표(10%) 미달. 이메일 제목 A/B 테스트 권장.
              </p>
            </div>
            <button className="text-xs text-[#e2e8f0] px-3 py-1 bg-[#334155] rounded hover:bg-[#475569] transition whitespace-nowrap">
              상세 보기
            </button>
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-6">
            <div className="text-xs text-[#94a3b8] font-semibold">이번 주 발송</div>
            <div className="text-3xl font-bold text-[#3b82f6] mt-2">
              {loading ? '...' : displayData.emails_sent}통
            </div>
            <div className="text-xs text-[#22c55e] mt-2">▲ 12% <span className="text-[#64748b]">지난주 대비</span></div>
            <div className="h-2 bg-[#334155] rounded mt-4 overflow-hidden">
              <div className="h-full bg-[#3b82f6]" style={{ width: '73%' }}></div>
            </div>
          </div>

          <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-6">
            <div className="text-xs text-[#94a3b8] font-semibold">전달율</div>
            <div className="text-3xl font-bold text-[#22c55e] mt-2">
              {loading ? '...' : displayData.delivery_rate}%
            </div>
            <div className="text-xs text-[#22c55e] mt-2">✓ 목표 초과 <span className="text-[#64748b]">(기준: 97%)</span></div>
            <div className="h-2 bg-[#334155] rounded mt-4 overflow-hidden">
              <div
                className="h-full bg-[#22c55e]"
                style={{ width: `${Math.min(displayData.delivery_rate, 100)}%` }}
              ></div>
            </div>
          </div>

          <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-6">
            <div className="text-xs text-[#94a3b8] font-semibold">열람율 (Tier 1)</div>
            <div className="text-3xl font-bold text-[#f59e0b] mt-2">
              {loading ? '...' : displayData.open_rate}%
            </div>
            <div className="text-xs text-[#f59e0b] mt-2">▼ 경고 <span className="text-[#64748b]">(기준: 45%)</span></div>
            <div className="h-2 bg-[#334155] rounded mt-4 overflow-hidden">
              <div className="h-full bg-[#f59e0b]" style={{ width: `${Math.min(displayData.open_rate, 100)}%` }}></div>
            </div>
          </div>

          <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-6">
            <div className="text-xs text-[#94a3b8] font-semibold">회신율 (Tier 1)</div>
            <div className="text-3xl font-bold text-[#22c55e] mt-2">
              {loading ? '...' : displayData.reply_rate}%
            </div>
            <div className="text-xs text-[#22c55e] mt-2">✓ 목표 달성 <span className="text-[#64748b]">(기준: 10%)</span></div>
            <div className="h-2 bg-[#334155] rounded mt-4 overflow-hidden">
              <div className="h-full bg-[#22c55e]" style={{ width: '100%' }}></div>
            </div>
          </div>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-3 gap-6">
          {/* Chart */}
          <div className="col-span-2 bg-[#1e293b] border border-[#334155] rounded-lg p-6">
            <div className="flex justify-between items-start mb-6">
              <div>
                <div className="text-sm font-semibold text-[#f1f5f9]">팀별 일일 발송 추이 (최근 7일)</div>
                <div className="text-xs text-[#94a3b8] mt-1">GCC · USA · Europe</div>
              </div>
              <select className="bg-[#1e293b] border border-[#334155] text-[#e2e8f0] rounded px-2 py-1 text-xs">
                <option>7일</option>
                <option>30일</option>
              </select>
            </div>
            <div className="h-[300px] flex items-end justify-around pt-8">
              {chartData.map((item, idx) => (
                <div key={idx} className="flex flex-col items-center gap-2 flex-1">
                  <div className="flex gap-1 items-end justify-center h-[200px]">
                    <div className="bg-[#3b82f6] rounded-t" style={{ width: '12px', height: `${item.gcc}px`, opacity: 0.9 }}></div>
                    <div className="bg-[#7c3aed] rounded-t" style={{ width: '12px', height: `${item.usa}px` }}></div>
                    <div className="bg-[#0891b2] rounded-t" style={{ width: '12px', height: `${item.europe}px` }}></div>
                  </div>
                  <div className="text-xs text-[#64748b]">{item.date}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-6">
            <div className="text-sm font-semibold text-[#f1f5f9] mb-4">최근 회신</div>
            <div className="space-y-3">
              {recentReplies.map((reply, idx) => (
                <div key={idx} className="flex items-start gap-3 pb-3 border-b border-[#334155]">
                  <div className="w-8 h-8 bg-[#334155] rounded-full flex items-center justify-center text-xs font-bold">
                    {reply.from[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-[#f1f5f9] truncate">{reply.from}</div>
                    <div className="text-xs text-[#94a3b8] truncate">{reply.company}</div>
                    <div className="text-xs text-[#64748b] mt-1">{reply.time}</div>
                  </div>
                  <div
                    className={`text-xs px-2 py-1 rounded whitespace-nowrap ${
                      reply.status === 'replied'
                        ? 'bg-[#22c55e]/20 text-[#22c55e]'
                        : 'bg-[#60a5fa]/20 text-[#60a5fa]'
                    }`}
                  >
                    {reply.status === 'replied' ? '회신' : '열람'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Team Status Table */}
        <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-6">
          <div className="text-sm font-semibold text-[#f1f5f9] mb-4">팀별 주간 현황</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#334155]">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748b] bg-[#1a2744]">팀</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748b] bg-[#1a2744]">발송</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748b] bg-[#1a2744]">열람</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748b] bg-[#1a2744]">회신</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748b] bg-[#1a2744]">회신율</th>
                </tr>
              </thead>
              <tbody>
                {teamStatus.map((row, idx) => (
                  <tr key={idx} className="border-b border-[#334155] hover:bg-[#273549]">
                    <td className="px-4 py-3 font-medium text-[#e2e8f0]">{row.team}</td>
                    <td className="text-right px-4 py-3 text-[#94a3b8]">{row.sent}</td>
                    <td className="text-right px-4 py-3 text-[#94a3b8]">{row.opened}</td>
                    <td className="text-right px-4 py-3 text-[#22c55e] font-semibold">{row.replied}</td>
                    <td className="text-right px-4 py-3 text-[#3b82f6] font-semibold">{row.replyRate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
