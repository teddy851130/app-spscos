'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ComposedChart,
} from 'recharts';
import type { KPISnapshot } from '../lib/types';
import { BarChart3, AlertTriangle, Target, Send, MailOpen, Check, X } from 'lucide-react';

interface TeamStat {
  team: string;
  region: string;
  flag: string;
  total: number;
  sent: number;
  replied: number;
  bounced: number;
  deliveryRate: string;
  openRate: string;
  replyRate: string;
  replyPct: number;
  delivPct: number;
}

const TEAM_REGIONS = [
  { team: 'GCC', region: 'GCC', flag: '🇸🇦' },
  { team: 'USA', region: 'USA', flag: '🇺🇸' },
  { team: 'Europe', region: 'Europe', flag: '🇬🇧' },
];

// DB는 영어 enum만 저장 — 영어만으로 비교
const isUnsent = (s: string) => !s || s === 'Cold';
const isReplied = (s: string) => s === 'Replied';
const isBounced = (s: string) => s === 'Bounced';

export default function KPIReport() {
  const [activeTab, setActiveTab] = useState('주간');
  const [teamStats, setTeamStats] = useState<TeamStat[]>([]);
  const [totals, setTotals] = useState({ sent: 0, replied: 0, bounced: 0 });
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState('');

  // --- 월간/전체 탭용 상태 ---
  const [snapshots, setSnapshots] = useState<KPISnapshot[]>([]);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [regionFilter, setRegionFilter] = useState<'ALL' | 'GCC' | 'USA' | 'Europe'>('ALL');

  useEffect(() => {
    async function fetchKPI() {
      setLoading(true);
      try {
        const { data: buyers } = await supabase
          .from('buyers')
          .select('id, region, status, last_sent_at');

        if (!buyers) { setLoading(false); return; }

        const stats: TeamStat[] = TEAM_REGIONS.map(({ team, region, flag }) => {
          const tb = buyers.filter((b) => b.region === region);
          const total = tb.length;
          const sent = tb.filter((b) => !isUnsent(b.status)).length;
          const replied = tb.filter((b) => isReplied(b.status)).length;
          const bounced = tb.filter((b) => isBounced(b.status)).length;

          const replyPct = sent > 0 ? Math.round((replied / sent) * 1000) / 10 : 0;
          const delivPct = sent > 0 ? Math.round(((sent - bounced) / sent) * 1000) / 10 : 0;
          // 열람율: 실제 추적 데이터 없으므로 "—" 표시 (허수 제거)
          const openPct = 0;

          return {
            team, region, flag, total, sent, replied, bounced,
            deliveryRate: sent > 0 ? `${delivPct}%` : '—',
            openRate: sent > 0 ? '추적 미설정' : '—',
            replyRate: sent > 0 ? `${replyPct}%` : '—',
            replyPct,
            delivPct,
          };
        });

        const allSent = buyers.filter((b) => !isUnsent(b.status)).length;
        const allReplied = buyers.filter((b) => isReplied(b.status)).length;
        const allBounced = buyers.filter((b) => isBounced(b.status)).length;

        setTeamStats(stats);
        setTotals({ sent: allSent, replied: allReplied, bounced: allBounced });
        setLastUpdated(new Date().toLocaleString('ko-KR'));
      } finally {
        setLoading(false);
      }
    }
    fetchKPI();
  }, []);

  // --- kpi_snapshots 데이터 로드 (월간/전체 탭 진입 시) ---
  useEffect(() => {
    if (activeTab === '주간') return;
    async function fetchSnapshots() {
      setSnapshotLoading(true);
      try {
        let query = supabase
          .from('kpi_snapshots')
          .select('*')
          .order('snapshot_date', { ascending: true });

        // 월간 탭: 최근 30일만
        if (activeTab === '월간') {
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          query = query.gte('snapshot_date', thirtyDaysAgo.toISOString().slice(0, 10));
        }

        const { data } = await query;
        setSnapshots(data ?? []);
      } finally {
        setSnapshotLoading(false);
      }
    }
    fetchSnapshots();
  }, [activeTab]);

  // --- 월간 탭: 리전 필터 적용 후 일별 데이터 ---
  const monthlyChartData = useMemo(() => {
    const filtered = regionFilter === 'ALL'
      ? snapshots
      : snapshots.filter((s) => s.region === regionFilter);

    // 같은 날짜의 데이터를 합산 (리전별 row가 있으므로)
    const byDate = new Map<string, { date: string; sent: number; replied: number; bounced: number }>();
    filtered.forEach((s) => {
      const key = s.snapshot_date;
      const prev = byDate.get(key) ?? { date: key, sent: 0, replied: 0, bounced: 0 };
      prev.sent += s.emails_sent;
      prev.replied += s.emails_replied;
      prev.bounced += s.emails_bounced;
      byDate.set(key, prev);
    });

    return Array.from(byDate.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({
        ...d,
        // X축 라벨: M/D 형식
        label: `${parseInt(d.date.slice(5, 7))}/${parseInt(d.date.slice(8, 10))}`,
      }));
  }, [snapshots, regionFilter]);

  // --- 전체 추이 탭: 월별 집계 ---
  const overallChartData = useMemo(() => {
    // 전체 데이터를 월별로 합산
    const byMonth = new Map<string, { month: string; sent: number; replied: number; bounced: number; newLeads: number }>();
    snapshots.forEach((s) => {
      const month = s.snapshot_date.slice(0, 7); // YYYY-MM
      const prev = byMonth.get(month) ?? { month, sent: 0, replied: 0, bounced: 0, newLeads: 0 };
      prev.sent += s.emails_sent;
      prev.replied += s.emails_replied;
      prev.bounced += s.emails_bounced;
      prev.newLeads += s.new_leads;
      byMonth.set(month, prev);
    });

    return Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [snapshots]);

  const overallReply = totals.sent > 0 ? Math.round((totals.replied / totals.sent) * 1000) / 10 : 0;
  const overallDeliv = totals.sent > 0
    ? Math.round(((totals.sent - totals.bounced) / totals.sent) * 1000) / 10
    : 0;

  const kpiCards = [
    { label: '전달율', value: totals.sent > 0 ? `${overallDeliv}%` : '—', target: '97% 이상', color: totals.sent === 0 ? 'yellow' : overallDeliv >= 97 ? 'green' : 'yellow', pct: overallDeliv },
    { label: '열람율', value: '추적 미설정', target: '45% 이상', color: 'yellow', pct: 0 },
    { label: '회신율', value: totals.sent > 0 ? `${overallReply}%` : '—', target: '10% 이상', color: totals.sent === 0 ? 'yellow' : overallReply >= 10 ? 'green' : 'red', pct: overallReply },
    { label: '스팸 신고율', value: totals.sent > 0 ? '측정 필요' : '—', target: '0.05% 미만', color: 'yellow', pct: 0 },
  ];

  const warnTeams = teamStats.filter((s) => s.sent > 0 && s.replyPct < 10);

  return (
    <div className="flex-1 overflow-y-auto h-full">
      <div className="p-6 space-y-6">
        {/* Tabs */}
        <div className="flex items-center justify-between border-b border-[#e3e8ee]">
          <div className="flex gap-4">
            {['주간', '월간', '전체 추이'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-3 text-sm font-semibold ${
                  activeTab === tab
                    ? 'border-b-2 border-[#635BFF] text-[#635BFF]'
                    : 'text-[#8792a2] hover:text-[#1a1f36]'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
          {lastUpdated && (
            <span className="text-xs text-[#8792a2] pb-3">마지막 업데이트: {lastUpdated}</span>
          )}
        </div>

        {/* === 월간 탭: 최근 30일 LineChart === */}
        {activeTab === '월간' && (
          <>
            {snapshotLoading ? (
              <div className="text-center py-12 text-[#8792a2] text-sm animate-pulse">
                월간 KPI 데이터 로딩 중...
              </div>
            ) : monthlyChartData.length === 0 ? (
              <div className="bg-[#ffffff] border border-[#e3e8ee] rounded-lg p-8 text-center">
                <div className="text-2xl mb-3"><BarChart3 size={24} className="inline text-[#697386]" /></div>
                <div className="text-sm font-semibold text-[#1a1f36]">
                  아직 KPI 데이터가 축적되지 않았습니다.
                </div>
                <div className="text-xs text-[#8792a2] mt-2">
                  매일 자동으로 수집됩니다.
                </div>
              </div>
            ) : (
              <>
                {/* 리전 필터 토글 */}
                <div className="flex gap-2">
                  {(['ALL', 'GCC', 'USA', 'Europe'] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => setRegionFilter(r)}
                      className={`px-3 py-1.5 text-xs rounded font-semibold transition ${
                        regionFilter === r
                          ? 'bg-[#635BFF] text-white'
                          : 'bg-[#ffffff] text-[#697386] border border-[#e3e8ee] hover:border-[#635BFF]'
                      }`}
                    >
                      {r === 'ALL' ? '전체' : r}
                    </button>
                  ))}
                </div>

                {/* 라인 차트 */}
                <div className="bg-[#ffffff] border border-[#e3e8ee] rounded-lg p-5">
                  <div className="text-sm font-semibold text-[#1a1f36] mb-4">
                    최근 30일 일별 추이 {regionFilter !== 'ALL' ? `(${regionFilter})` : ''}
                  </div>
                  <ResponsiveContainer width="100%" height={320}>
                    <LineChart data={monthlyChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e3e8ee" />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: '#697386', fontSize: 11 }}
                        axisLine={{ stroke: '#e3e8ee' }}
                      />
                      <YAxis
                        tick={{ fill: '#697386', fontSize: 11 }}
                        axisLine={{ stroke: '#e3e8ee' }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#ffffff',
                          border: '1px solid #e3e8ee',
                          borderRadius: 8,
                          color: '#1a1f36',
                          fontSize: 12,
                        }}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: 12, color: '#697386' }}
                      />
                      {/* 발송 — 파란색 */}
                      <Line
                        type="monotone"
                        dataKey="sent"
                        name="발송"
                        stroke="#635BFF"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                      {/* 회신 — 초록색 */}
                      <Line
                        type="monotone"
                        dataKey="replied"
                        name="회신"
                        stroke="#22c55e"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                      {/* 반송 — 빨간색 */}
                      <Line
                        type="monotone"
                        dataKey="bounced"
                        name="반송"
                        stroke="#ef4444"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </>
        )}

        {/* === 전체 추이 탭: 월별 BarChart + 신규 리드 Line === */}
        {activeTab === '전체 추이' && (
          <>
            {snapshotLoading ? (
              <div className="text-center py-12 text-[#8792a2] text-sm animate-pulse">
                전체 추이 데이터 로딩 중...
              </div>
            ) : overallChartData.length === 0 ? (
              <div className="bg-[#ffffff] border border-[#e3e8ee] rounded-lg p-8 text-center">
                <div className="text-2xl mb-3"><BarChart3 size={24} className="inline text-[#697386]" /></div>
                <div className="text-sm font-semibold text-[#1a1f36]">
                  아직 KPI 데이터가 축적되지 않았습니다.
                </div>
                <div className="text-xs text-[#8792a2] mt-2">
                  매일 자동으로 수집됩니다.
                </div>
              </div>
            ) : (
              <div className="bg-[#ffffff] border border-[#e3e8ee] rounded-lg p-5">
                <div className="text-sm font-semibold text-[#1a1f36] mb-4">
                  월별 이메일 KPI 추이
                </div>
                <ResponsiveContainer width="100%" height={360}>
                  <ComposedChart data={overallChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e3e8ee" />
                    <XAxis
                      dataKey="month"
                      tick={{ fill: '#697386', fontSize: 11 }}
                      axisLine={{ stroke: '#e3e8ee' }}
                    />
                    {/* 좌측 Y축: 이메일 건수 */}
                    <YAxis
                      yAxisId="left"
                      tick={{ fill: '#697386', fontSize: 11 }}
                      axisLine={{ stroke: '#e3e8ee' }}
                    />
                    {/* 우측 Y축: 신규 리드 수 */}
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tick={{ fill: '#f59e0b', fontSize: 11 }}
                      axisLine={{ stroke: '#e3e8ee' }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        border: '1px solid #e3e8ee',
                        borderRadius: 8,
                        color: '#1a1f36',
                        fontSize: 12,
                      }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 12, color: '#697386' }}
                    />
                    {/* 발송 바 — 파란색 */}
                    <Bar
                      yAxisId="left"
                      dataKey="sent"
                      name="발송"
                      fill="#635BFF"
                      radius={[4, 4, 0, 0]}
                    />
                    {/* 회신 바 — 초록색 */}
                    <Bar
                      yAxisId="left"
                      dataKey="replied"
                      name="회신"
                      fill="#22c55e"
                      radius={[4, 4, 0, 0]}
                    />
                    {/* 반송 바 — 빨간색 */}
                    <Bar
                      yAxisId="left"
                      dataKey="bounced"
                      name="반송"
                      fill="#ef4444"
                      radius={[4, 4, 0, 0]}
                    />
                    {/* 신규 리드 라인 — 노란색, 우측 Y축 */}
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="newLeads"
                      name="신규 리드"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}

        {activeTab === '주간' && (
          <>
          {loading ? (
            <div className="text-center py-12 text-[#8792a2] text-sm animate-pulse">KPI 데이터 로딩 중...</div>
          ) : (
            <>
            {/* KPI Cards */}
            <div className="grid grid-cols-4 gap-4">
              {kpiCards.map((kpi, idx) => (
                <div key={idx} className="bg-[#ffffff] border border-[#e3e8ee] rounded-lg p-5">
                  <div className="text-xs text-[#8792a2] font-semibold uppercase tracking-wide">{kpi.label}</div>
                  <div className={`text-2xl font-bold mt-2 ${
                    kpi.color === 'green' ? 'text-[#22c55e]' :
                    kpi.color === 'red' ? 'text-[#ef4444]' :
                    'text-[#f59e0b]'
                  }`}>
                    {kpi.value}
                  </div>
                  <div className="text-xs text-[#8792a2] mt-2">목표: {kpi.target}</div>
                  <div className="h-1 bg-[#e3e8ee] rounded mt-3 overflow-hidden">
                    <div className={`h-full ${
                      kpi.color === 'green' ? 'bg-[#22c55e]' :
                      kpi.color === 'red' ? 'bg-[#ef4444]' :
                      'bg-[#f59e0b]'
                    }`} style={{ width: `${Math.min(100, kpi.pct)}%` }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Summary Counts */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: '총 발송 건수', value: totals.sent, icon: <Send size={24} className="inline text-[#635BFF]" />, color: 'text-[#635BFF]' },
                { label: '회신 건수', value: totals.replied, icon: <MailOpen size={24} className="inline text-[#22c55e]" />, color: 'text-[#22c55e]' },
                { label: '반송 건수', value: totals.bounced, icon: <AlertTriangle size={24} className="inline text-[#f59e0b]" />, color: 'text-[#f59e0b]' },
              ].map((item) => (
                <div key={item.label} className="bg-[#ffffff] border border-[#e3e8ee] rounded-lg p-4 flex items-center gap-4">
                  <span className="text-2xl">{item.icon}</span>
                  <div>
                    <div className={`text-2xl font-bold ${item.color}`}>{item.value}</div>
                    <div className="text-xs text-[#8792a2]">{item.label}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Team Detail Table */}
            <div className="bg-[#ffffff] border border-[#e3e8ee] rounded-lg p-5">
              <div className="text-sm font-semibold text-[#1a1f36] mb-4">팀별 KPI 상세 비교 (누적 현황)</div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#e3e8ee]">
                      <th className="text-left px-4 py-3 font-semibold text-[#8792a2]">팀</th>
                      <th className="text-center px-4 py-3 font-semibold text-[#8792a2]">총 바이어</th>
                      <th className="text-center px-4 py-3 font-semibold text-[#8792a2]">발송</th>
                      <th className="text-center px-4 py-3 font-semibold text-[#8792a2]">전달율</th>
                      <th className="text-center px-4 py-3 font-semibold text-[#8792a2]">열람율</th>
                      <th className="text-center px-4 py-3 font-semibold text-[#8792a2]">회신율</th>
                      <th className="text-center px-4 py-3 font-semibold text-[#8792a2]">스팸 신고율</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-[#e3e8ee]">
                      <td className="px-4 py-3 font-semibold text-[#8792a2]"><Target size={16} className="inline text-[#635BFF]" /> 목표 기준</td>
                      <td className="px-4 py-3 text-center text-[#8792a2]">—</td>
                      <td className="px-4 py-3 text-center text-[#8792a2]">—</td>
                      <td className="px-4 py-3 text-center text-[#8792a2]">&gt;97%</td>
                      <td className="px-4 py-3 text-center text-[#8792a2]">&gt;45%</td>
                      <td className="px-4 py-3 text-center text-[#8792a2]">&gt;10%</td>
                      <td className="px-4 py-3 text-center text-[#8792a2]">&lt;0.05%</td>
                    </tr>
                    {teamStats.map((row) => {
                      const isGood = row.sent > 0 && row.replyPct >= 10;
                      const isWarn = row.sent > 0 && row.replyPct < 10;
                      return (
                        <tr key={row.region} className={`border-b border-[#e3e8ee] ${isGood ? 'bg-[#0a3a1f20]' : isWarn ? 'bg-[#3a0a0a20]' : ''}`}>
                          <td className="px-4 py-3 font-semibold text-[#1a1f36]">{row.flag} {row.team}</td>
                          <td className="px-4 py-3 text-center text-[#697386]">{row.total}</td>
                          <td className="px-4 py-3 text-center text-[#697386]">{row.sent}</td>
                          <td className={`px-4 py-3 text-center font-semibold ${row.delivPct >= 97 ? 'text-[#22c55e]' : row.sent > 0 ? 'text-[#f59e0b]' : 'text-[#8792a2]'}`}>
                            {row.deliveryRate}{row.sent > 0 && row.delivPct >= 97 ? '✓' : row.sent > 0 ? '△' : ''}
                          </td>
                          <td className="px-4 py-3 text-center font-semibold text-[#f59e0b]">
                            {row.openRate}
                          </td>
                          <td className={`px-4 py-3 text-center font-semibold ${
                            row.replyPct >= 10 ? 'text-[#22c55e]' :
                            row.sent > 0 ? 'text-[#ef4444]' :
                            'text-[#8792a2]'
                          }`}>
                            {row.replyRate}{row.sent > 0 ? (row.replyPct >= 10 ? '✓' : '✗') : ''}
                          </td>
                          <td className="px-4 py-3 text-center font-semibold text-[#8792a2]">{row.sent > 0 ? '측정 필요' : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Warning */}
            {warnTeams.length > 0 && (
              <div className="bg-[#7f1d1d]/20 border border-[#ef4444]/25 rounded-lg p-4">
                <div className="text-sm font-semibold text-[#fca5a5]">
                  <AlertTriangle size={16} className="inline text-[#f59e0b]" /> {warnTeams.map((t) => t.region).join(', ')} 팀 회신율 저조 — 개선 필요
                </div>
                {warnTeams.map((t) => (
                  <p key={t.region} className="text-xs text-[#fca5a5] mt-1">
                    {t.region}: 회신율 {t.replyRate} — 이메일 제목 A/B 테스트, 발송 시간 최적화, 템플릿 개선 권장.
                  </p>
                ))}
              </div>
            )}

            {totals.sent === 0 && (
              <div className="bg-[#1e3a5f] border border-[#635BFF]/30 rounded-lg p-4 text-center">
                <div className="text-sm text-[#93c5fd]">
                  <BarChart3 size={16} className="inline text-[#697386]" /> 아직 발송 기록이 없습니다. 바이어 DB에서 이메일을 발송하면 KPI가 자동 업데이트됩니다.
                </div>
              </div>
            )}
            </>
          )}
          </>
        )}
      </div>
    </div>
  );
}
