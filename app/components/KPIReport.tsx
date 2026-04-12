'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

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
        <div className="flex items-center justify-between border-b border-[#334155]">
          <div className="flex gap-4">
            {['주간', '월간', '전체 추이'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-3 text-sm font-semibold ${
                  activeTab === tab
                    ? 'border-b-2 border-[#3b82f6] text-[#3b82f6]'
                    : 'text-[#64748b] hover:text-[#e2e8f0]'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
          {lastUpdated && (
            <span className="text-xs text-[#475569] pb-3">마지막 업데이트: {lastUpdated}</span>
          )}
        </div>

        {activeTab !== '주간' && (
          <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-8 text-center">
            <div className="text-2xl mb-3">📊</div>
            <div className="text-sm font-semibold text-[#f1f5f9]">{activeTab} 데이터</div>
            <div className="text-xs text-[#64748b] mt-2">
              {activeTab === '월간'
                ? '월간 데이터는 4주 이상 발송 데이터가 쌓이면 자동으로 표시됩니다.'
                : '전체 추이 차트는 kpi_snapshots 테이블에 데이터가 축적되면 활성화됩니다.'}
            </div>
          </div>
        )}

        {activeTab === '주간' && (
          <>
          {loading ? (
            <div className="text-center py-12 text-[#64748b] text-sm animate-pulse">KPI 데이터 로딩 중...</div>
          ) : (
            <>
            {/* KPI Cards */}
            <div className="grid grid-cols-4 gap-4">
              {kpiCards.map((kpi, idx) => (
                <div key={idx} className="bg-[#1e293b] border border-[#334155] rounded-lg p-5">
                  <div className="text-xs text-[#64748b] font-semibold uppercase tracking-wide">{kpi.label}</div>
                  <div className={`text-2xl font-bold mt-2 ${
                    kpi.color === 'green' ? 'text-[#22c55e]' :
                    kpi.color === 'red' ? 'text-[#ef4444]' :
                    'text-[#f59e0b]'
                  }`}>
                    {kpi.value}
                  </div>
                  <div className="text-xs text-[#64748b] mt-2">목표: {kpi.target}</div>
                  <div className="h-1 bg-[#334155] rounded mt-3 overflow-hidden">
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
                { label: '총 발송 건수', value: totals.sent, icon: '📤', color: 'text-[#3b82f6]' },
                { label: '회신 건수', value: totals.replied, icon: '✉️', color: 'text-[#22c55e]' },
                { label: '반송 건수', value: totals.bounced, icon: '⚠️', color: 'text-[#f59e0b]' },
              ].map((item) => (
                <div key={item.label} className="bg-[#1e293b] border border-[#334155] rounded-lg p-4 flex items-center gap-4">
                  <span className="text-2xl">{item.icon}</span>
                  <div>
                    <div className={`text-2xl font-bold ${item.color}`}>{item.value}</div>
                    <div className="text-xs text-[#64748b]">{item.label}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Team Detail Table */}
            <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-5">
              <div className="text-sm font-semibold text-[#f1f5f9] mb-4">팀별 KPI 상세 비교 (누적 현황)</div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#334155]">
                      <th className="text-left px-4 py-3 font-semibold text-[#64748b]">팀</th>
                      <th className="text-center px-4 py-3 font-semibold text-[#64748b]">총 바이어</th>
                      <th className="text-center px-4 py-3 font-semibold text-[#64748b]">발송</th>
                      <th className="text-center px-4 py-3 font-semibold text-[#64748b]">전달율</th>
                      <th className="text-center px-4 py-3 font-semibold text-[#64748b]">열람율</th>
                      <th className="text-center px-4 py-3 font-semibold text-[#64748b]">회신율</th>
                      <th className="text-center px-4 py-3 font-semibold text-[#64748b]">스팸 신고율</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-[#334155]">
                      <td className="px-4 py-3 font-semibold text-[#64748b]">🎯 목표 기준</td>
                      <td className="px-4 py-3 text-center text-[#64748b]">—</td>
                      <td className="px-4 py-3 text-center text-[#64748b]">—</td>
                      <td className="px-4 py-3 text-center text-[#64748b]">&gt;97%</td>
                      <td className="px-4 py-3 text-center text-[#64748b]">&gt;45%</td>
                      <td className="px-4 py-3 text-center text-[#64748b]">&gt;10%</td>
                      <td className="px-4 py-3 text-center text-[#64748b]">&lt;0.05%</td>
                    </tr>
                    {teamStats.map((row) => {
                      const isGood = row.sent > 0 && row.replyPct >= 10;
                      const isWarn = row.sent > 0 && row.replyPct < 10;
                      return (
                        <tr key={row.region} className={`border-b border-[#334155] ${isGood ? 'bg-[#0a3a1f20]' : isWarn ? 'bg-[#3a0a0a20]' : ''}`}>
                          <td className="px-4 py-3 font-semibold text-[#e2e8f0]">{row.flag} {row.team}</td>
                          <td className="px-4 py-3 text-center text-[#94a3b8]">{row.total}</td>
                          <td className="px-4 py-3 text-center text-[#94a3b8]">{row.sent}</td>
                          <td className={`px-4 py-3 text-center font-semibold ${row.delivPct >= 97 ? 'text-[#22c55e]' : row.sent > 0 ? 'text-[#f59e0b]' : 'text-[#64748b]'}`}>
                            {row.deliveryRate}{row.sent > 0 && row.delivPct >= 97 ? '✓' : row.sent > 0 ? '△' : ''}
                          </td>
                          <td className="px-4 py-3 text-center font-semibold text-[#f59e0b]">
                            {row.openRate}
                          </td>
                          <td className={`px-4 py-3 text-center font-semibold ${
                            row.replyPct >= 10 ? 'text-[#22c55e]' :
                            row.sent > 0 ? 'text-[#ef4444]' :
                            'text-[#64748b]'
                          }`}>
                            {row.replyRate}{row.sent > 0 ? (row.replyPct >= 10 ? '✓' : '✗') : ''}
                          </td>
                          <td className="px-4 py-3 text-center font-semibold text-[#64748b]">{row.sent > 0 ? '측정 필요' : '—'}</td>
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
                  ⚠️ {warnTeams.map((t) => t.region).join(', ')} 팀 회신율 저조 — 개선 필요
                </div>
                {warnTeams.map((t) => (
                  <p key={t.region} className="text-xs text-[#fca5a5] mt-1">
                    {t.region}: 회신율 {t.replyRate} — 이메일 제목 A/B 테스트, 발송 시간 최적화, 템플릿 개선 권장.
                  </p>
                ))}
              </div>
            )}

            {totals.sent === 0 && (
              <div className="bg-[#1e3a5f] border border-[#3b82f6]/30 rounded-lg p-4 text-center">
                <div className="text-sm text-[#93c5fd]">
                  📊 아직 발송 기록이 없습니다. 바이어 DB에서 이메일을 발송하면 KPI가 자동 업데이트됩니다.
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
