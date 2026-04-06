'use client';

const domainData = {
  domain: 'spscos.com',
  status: 'healthy',
  reputation: {
    spfScore: 'Pass',
    dkimScore: 'Pass',
    dmarcScore: 'Pass',
    spamRate: '0.2%',
    reputation: '98/100',
  },
  warnings: [
    { type: 'info', msg: '마지막 점검: 2026년 4월 4일 23:45' },
  ],
};

const spfDetails = [
  { record: 'v=spf1', value: 'SPF v1', status: 'valid' },
  { record: 'include:sendgrid.net', value: 'SendGrid 포함', status: 'valid' },
  { record: 'include:_spf.google.com', value: 'Google 포함', status: 'valid' },
  { record: '~all', value: 'Soft Fail', status: 'valid' },
];

const dkimDetails = [
  { selector: 'default', status: 'valid', bits: '2048-bit' },
  { selector: 'sendgrid', status: 'valid', bits: '1024-bit' },
];

const dmarcDetails = [
  { policy: 'p=quarantine', description: '수의적 격리 정책', status: 'active' },
  { policy: 'rua=mailto:dmarc@spscos.com', description: '일일 리포트', status: 'active' },
  { policy: 'ruf=mailto:dmarc-ruf@spscos.com', description: '실시간 리포트', status: 'active' },
];

const domainHistory = [
  { date: '2026-04-04', spf: 'Pass', dkim: 'Pass', dmarc: 'Pass', action: '확인' },
  { date: '2026-04-03', spf: 'Pass', dkim: 'Pass', dmarc: 'Pass', action: '확인' },
  { date: '2026-04-02', spf: 'Pass', dkim: 'Pass', dmarc: 'Pass', action: '확인' },
  { date: '2026-04-01', spf: 'Pass', dkim: 'Pass', dmarc: 'Pass', action: '확인' },
];

export default function Domain() {
  return (
    <div className="flex-1 flex flex-col overflow-auto">
      {/* Topbar */}
      <div className="sticky top-0 bg-[#0f172a] border-b border-[#334155] px-8 py-6 z-10">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-[#f1f5f9]">도메인 상태</h1>
            <p className="text-sm text-[#94a3b8] mt-1">{domainData.domain}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-[#22c55e] rounded-full"></div>
            <span className="text-sm font-semibold text-[#22c55e]">정상</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-8 space-y-8">
        {/* Health Score */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-6">
            <div className="text-xs text-[#94a3b8] font-semibold">SPF</div>
            <div className="text-2xl font-bold text-[#22c55e] mt-2">{domainData.reputation.spfScore}</div>
            <div className="text-xs text-[#64748b] mt-2">설정됨</div>
          </div>
          <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-6">
            <div className="text-xs text-[#94a3b8] font-semibold">DKIM</div>
            <div className="text-2xl font-bold text-[#22c55e] mt-2">{domainData.reputation.dkimScore}</div>
            <div className="text-xs text-[#64748b] mt-2">설정됨</div>
          </div>
          <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-6">
            <div className="text-xs text-[#94a3b8] font-semibold">DMARC</div>
            <div className="text-2xl font-bold text-[#22c55e] mt-2">{domainData.reputation.dmarcScore}</div>
            <div className="text-xs text-[#64748b] mt-2">설정됨</div>
          </div>
          <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-6">
            <div className="text-xs text-[#94a3b8] font-semibold">평판 점수</div>
            <div className="text-2xl font-bold text-[#22c55e] mt-2">{domainData.reputation.reputation}</div>
            <div className="text-xs text-[#64748b] mt-2">매우 높음</div>
          </div>
        </div>

        {/* Spam & Reputation */}
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-6">
            <div className="text-sm font-semibold text-[#f1f5f9] mb-4">스팸율</div>
            <div className="flex items-end gap-4">
              <div>
                <div className="text-3xl font-bold text-[#22c55e]">{domainData.reputation.spamRate}</div>
                <div className="text-xs text-[#64748b] mt-1">목표: &lt; 0.5%</div>
              </div>
              <div className="flex-1">
                <div className="h-2 bg-[#334155] rounded-full overflow-hidden">
                  <div className="h-full bg-[#22c55e]" style={{ width: '40%' }}></div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-6">
            <div className="text-sm font-semibold text-[#f1f5f9] mb-4">도메인 평판</div>
            <div className="flex items-end gap-4">
              <div>
                <div className="text-3xl font-bold text-[#22c55e]">98/100</div>
                <div className="text-xs text-[#64748b] mt-1">업계 상위 5%</div>
              </div>
              <div className="flex-1">
                <div className="h-2 bg-[#334155] rounded-full overflow-hidden">
                  <div className="h-full bg-[#22c55e]" style={{ width: '98%' }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* SPF Details */}
        <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-6">
          <div className="text-sm font-semibold text-[#f1f5f9] mb-4">SPF 레코드</div>
          <div className="space-y-2">
            {spfDetails.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-[#0f172a] rounded border border-[#334155]">
                <div>
                  <div className="text-sm font-semibold text-[#e2e8f0]">{item.record}</div>
                  <div className="text-xs text-[#94a3b8]">{item.value}</div>
                </div>
                <span className="text-xs px-3 py-1 bg-[#22c55e]/20 text-[#22c55e] rounded font-medium">
                  {item.status === 'valid' ? '유효' : '경고'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* DKIM Details */}
        <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-6">
          <div className="text-sm font-semibold text-[#f1f5f9] mb-4">DKIM 키</div>
          <div className="space-y-2">
            {dkimDetails.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-[#0f172a] rounded border border-[#334155]">
                <div>
                  <div className="text-sm font-semibold text-[#e2e8f0]">Selector: {item.selector}</div>
                  <div className="text-xs text-[#94a3b8]">{item.bits}</div>
                </div>
                <span className="text-xs px-3 py-1 bg-[#22c55e]/20 text-[#22c55e] rounded font-medium">
                  활성
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* DMARC Policy */}
        <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-6">
          <div className="text-sm font-semibold text-[#f1f5f9] mb-4">DMARC 정책</div>
          <div className="space-y-2">
            {dmarcDetails.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-[#0f172a] rounded border border-[#334155]">
                <div>
                  <div className="text-sm font-semibold text-[#e2e8f0]">{item.policy}</div>
                  <div className="text-xs text-[#94a3b8]">{item.description}</div>
                </div>
                <span className="text-xs px-3 py-1 bg-[#22c55e]/20 text-[#22c55e] rounded font-medium">
                  활성
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* History */}
        <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-6">
          <div className="text-sm font-semibold text-[#f1f5f9] mb-4">최근 점검 기록</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#334155]">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748b]">날짜</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-[#64748b]">SPF</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-[#64748b]">DKIM</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-[#64748b]">DMARC</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-[#64748b]">작업</th>
                </tr>
              </thead>
              <tbody>
                {domainHistory.map((row, idx) => (
                  <tr key={idx} className="border-b border-[#334155] hover:bg-[#273549]">
                    <td className="px-4 py-3 text-[#94a3b8]">{row.date}</td>
                    <td className="text-center px-4 py-3">
                      <span className="text-xs px-2 py-1 bg-[#22c55e]/20 text-[#22c55e] rounded">
                        {row.spf}
                      </span>
                    </td>
                    <td className="text-center px-4 py-3">
                      <span className="text-xs px-2 py-1 bg-[#22c55e]/20 text-[#22c55e] rounded">
                        {row.dkim}
                      </span>
                    </td>
                    <td className="text-center px-4 py-3">
                      <span className="text-xs px-2 py-1 bg-[#22c55e]/20 text-[#22c55e] rounded">
                        {row.dmarc}
                      </span>
                    </td>
                    <td className="text-center px-4 py-3">
                      <button className="text-xs text-[#3b82f6] hover:text-[#60a5fa]">{row.action}</button>
                    </td>
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
