'use client';

const teamMetrics = [
  { team: 'GCC', sent: 450, opened: 315, clicked: 89, replied: 60, openRate: '70%', clickRate: '20%', replyRate: '13.3%' },
  { team: 'USA', sent: 380, opened: 133, clicked: 52, replied: 15, openRate: '35%', clickRate: '14%', replyRate: '4.0%' },
  { team: 'Europe', sent: 320, opened: 224, clicked: 62, replied: 37, openRate: '70%', clickRate: '19%', replyRate: '11.6%' },
];

const tierMetrics = [
  { tier: 'Tier 1', sent: 780, opened: 559, clicked: 168, replied: 92, replyRate: '11.8%' },
  { tier: 'Tier 2', sent: 240, opened: 108, clicked: 28, replied: 12, replyRate: '5.0%' },
  { tier: 'Tier 3', sent: 80, opened: 32, clicked: 7, replied: 1, replyRate: '1.3%' },
];

const trendData = [
  { week: 'W1', gcc: 120, usa: 95, europe: 85 },
  { week: 'W2', gcc: 135, usa: 102, europe: 98 },
  { week: 'W3', gcc: 155, usa: 118, europe: 112 },
  { week: 'W4', gcc: 180, usa: 132, europe: 128 },
];

const replyTrendData = [
  { date: '3/29', tier1: 8, tier2: 2, tier3: 0 },
  { date: '3/30', gcc: 10, usa: 2, europe: 1 },
  { date: '3/31', tier1: 12, tier2: 3, tier3: 0 },
  { date: '4/1', tier1: 14, tier2: 4, tier3: 1 },
  { date: '4/2', tier1: 18, tier2: 5, tier3: 0 },
  { date: '4/3', tier1: 22, tier2: 6, tier3: 1 },
  { date: '4/4', tier1: 25, tier2: 7, tier3: 1 },
];

export default function KPIReport() {
  return (
    <div className="flex-1 flex flex-col overflow-auto">
      {/* Topbar */}
      <div className="sticky top-0 bg-[#0f172a] border-b border-[#334155] px-8 py-6 z-10">
        <div>
          <h1 className="text-2xl font-bold text-[#f1f5f9]">KPI 리포트</h1>
          <p className="text-sm text-[#94a3b8] mt-1">팀별 · Tier별 상세 지표</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-8 space-y-8">
        {/* Team Metrics */}
        <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-6">
          <div className="text-sm font-semibold text-[#f1f5f9] mb-4">팀별 성과</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#334155]">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748b]">팀</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748b]">발송</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748b]">열람</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748b]">클릭</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748b]">회신</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748b]">열람율</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748b]">클릭율</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748b]">회신율</th>
                </tr>
              </thead>
              <tbody>
                {teamMetrics.map((row, idx) => (
                  <tr key={idx} className="border-b border-[#334155] hover:bg-[#273549]">
                    <td className="px-4 py-3 font-semibold text-[#e2e8f0]">{row.team}</td>
                    <td className="text-right px-4 py-3 text-[#94a3b8]">{row.sent}</td>
                    <td className="text-right px-4 py-3 text-[#94a3b8]">{row.opened}</td>
                    <td className="text-right px-4 py-3 text-[#94a3b8]">{row.clicked}</td>
                    <td className="text-right px-4 py-3 text-[#22c55e] font-semibold">{row.replied}</td>
                    <td className="text-right px-4 py-3 text-[#60a5fa] font-semibold">{row.openRate}</td>
                    <td className="text-right px-4 py-3 text-[#f59e0b] font-semibold">{row.clickRate}</td>
                    <td className="text-right px-4 py-3 text-[#22c55e] font-semibold">{row.replyRate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Tier Metrics */}
        <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-6">
          <div className="text-sm font-semibold text-[#f1f5f9] mb-4">Tier별 성과</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#334155]">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748b]">Tier</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748b]">발송</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748b]">열람</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748b]">클릭</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748b]">회신</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748b]">회신율</th>
                </tr>
              </thead>
              <tbody>
                {tierMetrics.map((row, idx) => (
                  <tr key={idx} className="border-b border-[#334155] hover:bg-[#273549]">
                    <td className="px-4 py-3 font-semibold text-[#e2e8f0]">{row.tier}</td>
                    <td className="text-right px-4 py-3 text-[#94a3b8]">{row.sent}</td>
                    <td className="text-right px-4 py-3 text-[#94a3b8]">{row.opened}</td>
                    <td className="text-right px-4 py-3 text-[#94a3b8]">{row.clicked}</td>
                    <td className="text-right px-4 py-3 text-[#22c55e] font-semibold">{row.replied}</td>
                    <td className="text-right px-4 py-3 text-[#22c55e] font-semibold">{row.replyRate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Send Trend */}
        <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-6">
          <div className="text-sm font-semibold text-[#f1f5f9] mb-4">주별 발송 추이</div>
          <div className="h-[300px] flex items-end justify-around pt-8">
            {trendData.map((item, idx) => (
              <div key={idx} className="flex flex-col items-center gap-2 flex-1">
                <div className="flex gap-1 items-end justify-center h-[200px]">
                  <div className="bg-[#3b82f6] rounded-t" style={{ width: '12px', height: `${item.gcc}px` }}></div>
                  <div className="bg-[#7c3aed] rounded-t" style={{ width: '12px', height: `${item.usa}px` }}></div>
                  <div className="bg-[#0891b2] rounded-t" style={{ width: '12px', height: `${item.europe}px` }}></div>
                </div>
                <div className="text-xs text-[#64748b]">{item.week}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Reply Trend */}
        <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-6">
          <div className="text-sm font-semibold text-[#f1f5f9] mb-4">일별 회신 추이</div>
          <div className="h-[300px] relative pt-8">
            <svg width="100%" height="300" viewBox="0 0 700 300" className="absolute">
              <polyline points={replyTrendData.map((d, i) => `${(i * 100) + 10},${250 - (d.tier1 ?? 0 * 2)}`).join(' ')} fill="none" stroke="#22c55e" strokeWidth="2" />
              <polyline points={replyTrendData.map((d, i) => `${(i * 100) + 10},${250 - (d.tier2 ?? 0 * 2)}`).join(' ')} fill="none" stroke="#f59e0b" strokeWidth="2" />
              <polyline points={replyTrendData.map((d, i) => `${(i * 100) + 10},${250 - (d.tier3 ?? 0 * 2)}`).join(' ')} fill="none" stroke="#ef4444" strokeWidth="2" />
              {replyTrendData.map((item, idx) => (
                <g key={idx}>
                  <text x={(idx * 100) + 10} y="280" fill="#64748b" fontSize="12" textAnchor="middle">{item.date}</text>
                </g>
              ))}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
