'use client';

import { useState, useEffect } from 'react';
import EmailComposeModal from './EmailComposeModal';
import AddBuyerModal from './AddBuyerModal';
import BuyerIntelDrawer from './BuyerIntelDrawer';
import { supabase } from '../lib/supabase';

const gradients = [
  'from-[#3b82f6] to-[#7c3aed]',
  'from-[#7c3aed] to-[#ec4899]',
  'from-[#06b6d4] to-[#3b82f6]',
  'from-[#f59e0b] to-[#ef4444]',
  'from-[#10b981] to-[#06b6d4]',
  'from-[#ef4444] to-[#f59e0b]',
  'from-[#8b5cf6] to-[#06b6d4]',
  'from-[#ec4899] to-[#f59e0b]',
];

function getGradient(company: string): string {
  let hash = 0;
  for (let i = 0; i < company.length; i++) hash = (hash * 31 + company.charCodeAt(i)) % gradients.length;
  return gradients[Math.abs(hash)];
}

export default function Buyers() {
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState('');
  const [tier, setTier] = useState('');
  const [status, setStatus] = useState('');
  const [date, setDate] = useState('');
  const [buyers, setBuyers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedBuyer, setSelectedBuyer] = useState<any>(null);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [addBuyerModalOpen, setAddBuyerModalOpen] = useState(false);
  const [intelDrawerOpen, setIntelDrawerOpen] = useState(false);
  const [intelBuyer, setIntelBuyer] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<'all' | 'blacklist'>('all');
  const [blacklistDomains, setBlacklistDomains] = useState<{ domain: string; company: string; reason: string }[]>([]);
  const PAGE_SIZE = 20;

  // DB status → display status mapping
  const mapStatus = (s: string) => {
    if (!s || s === 'Cold' || s === '미발송') return '미발송';
    if (s === 'Contacted' || s === '발송완료' || s === '발송됨') return '발송완료';
    if (s === 'Replied' || s === '회신받음') return '회신받음';
    if (s === 'Bounced' || s === '반송됨') return '반송됨';
    return s;
  };
  // DB tier → display tier (add space for display)
  const displayTier = (t: string) => {
    if (t === 'Tier1') return 'Tier 1';
    if (t === 'Tier2') return 'Tier 2';
    if (t === 'Tier3') return 'Tier 3';
    return t;
  };

  useEffect(() => {
    async function fetchBuyers() {
      try {
        setLoading(true);
        const { data, error, count } = await supabase
          .from('buyers')
          .select('*, buyer_contacts(linkedin_url, contact_name, contact_email, contact_title, is_primary)', { count: 'exact' })
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Buyers fetch error:', error);
        } else if (data) {
          const mapped = data.map((row: any) => {
            // primary contact 우선, 없으면 첫번째 contact 사용
            const contacts = (row.buyer_contacts || []) as any[];
            const primary = contacts.find((c) => c.is_primary) || contacts[0];

            return {
              id: row.id,
              company: row.company_name || '',
              domain: row.domain || '',
              region: row.region || '',
              team: row.team || row.region || '',
              tier: row.tier || 'Tier2',
              tierDisplay: displayTier(row.tier || 'Tier2'),
              contact: primary?.contact_name || row.contact_name || '',
              title: primary?.contact_title || row.contact_title || '',
              email: primary?.contact_email || row.contact_email || '',
              website: row.website || '',
              linkedin_url: primary?.linkedin_url || row.linkedin_url || '',
              lastSent: row.last_sent_at ? new Date(row.last_sent_at).toLocaleDateString('ko-KR') : '미발송',
              status: mapStatus(row.status),
              is_blacklisted: row.is_blacklisted || false,
              annual_revenue: row.annual_revenue,
              discovered_at: row.discovered_at,
            };
          });
          setBuyers(mapped);
          setTotalCount(count || data.length);

          // 블랙리스트 도메인 목록
          const bl = data
            .filter((row: any) => row.is_blacklisted)
            .map((row: any) => ({
              domain: row.domain || row.website || '',
              company: row.company_name || '',
              reason: 'Invalid email / Tier2 catch-all',
            }));
          setBlacklistDomains(bl);
        }
      } catch (err) {
        console.error('Buyers fetch error:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchBuyers();
  }, []);

  const filtered = buyers.filter((b) => {
    if (search && !b.company.toLowerCase().includes(search.toLowerCase()) && !b.contact.toLowerCase().includes(search.toLowerCase()) && !b.email.toLowerCase().includes(search.toLowerCase())) return false;
    if (region && b.region !== region) return false;
    if (tier && b.tier !== tier) return false;
    if (status && b.status !== status) return false;
    return true;
  });

  const displayCount = filtered.length;
  const totalPages = Math.ceil(displayCount / PAGE_SIZE) || 1;
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [search, region, tier, status, date]);

  const handleEmailClick = (buyer: any) => {
    setSelectedBuyer(buyer);
    setEmailModalOpen(true);
  };

  const handleCompanyClick = (buyer: any) => {
    setIntelBuyer(buyer);
    setIntelDrawerOpen(true);
  };

  const handleAddBuyer = async (buyerData: any) => {
    try {
      const insertData = {
        company_name: buyerData.company,
        website: buyerData.website || '',
        region: buyerData.region || 'GCC',
        tier: buyerData.tier || 'Tier 3',
        contact_name: buyerData.contact,
        contact_title: buyerData.title,
        contact_email: buyerData.email,
        status: '미발송',
      };
      const { data, error } = await supabase
        .from('buyers')
        .insert([insertData])
        .select()
        .single();

      if (error) {
        console.error('Add buyer error:', error);
        alert('바이어 추가 실패: ' + error.message);
      } else if (data) {
        const newBuyer = {
          id: data.id,
          company: data.company_name || '',
          region: data.region || '',
          tier: data.tier || 'Tier 3',
          contact: data.contact_name || '',
          title: data.contact_title || '',
          email: data.contact_email || '',
          website: data.website || '',
          lastSent: '방금',
          status: '미발송',
        };
        setBuyers([newBuyer, ...buyers]);
        setTotalCount((prev) => prev + 1);
      }
    } catch (err) {
      console.error('Add buyer error:', err);
    }
  };

  // Update buyer status in list after email sent
  const handleEmailSent = (buyerId: string) => {
    setBuyers((prev) =>
      prev.map((b) =>
        b.id === buyerId
          ? { ...b, status: '발송완료', lastSent: new Date().toLocaleDateString('ko-KR') }
          : b
      )
    );
  };

  const downloadCSV = () => {
    const headers = ['회사', '리전', 'Tier', '담당자', '직책', '이메일', '마지막발송', '상태'];
    const rows = filtered.map((b) => [b.company, b.region, b.tier, b.contact, b.title, b.email, b.lastSent, b.status]);
    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `SPS_바이어DB_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex-1 overflow-y-auto h-full">
      <div className="p-6 space-y-4">
        {/* View Mode Tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('all')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${
              viewMode === 'all'
                ? 'bg-[#3b82f6] text-white'
                : 'bg-[#1e293b] border border-[#334155] text-[#94a3b8] hover:text-[#f1f5f9]'
            }`}
          >
            전체 바이어 DB ({buyers.filter(b => !b.is_blacklisted).length})
          </button>
          <button
            onClick={() => setViewMode('blacklist')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${
              viewMode === 'blacklist'
                ? 'bg-[#ef4444] text-white'
                : 'bg-[#1e293b] border border-[#334155] text-[#94a3b8] hover:text-[#f1f5f9]'
            }`}
          >
            블랙리스트 ({blacklistDomains.length})
          </button>
        </div>

        {/* Info Banner */}
        <div className="bg-[#1e3a5f30] border border-[#3b82f640] rounded-lg p-3 flex items-center gap-3">
          <span className="text-lg flex-shrink-0">💡</span>
          <span className="text-xs text-[#93c5fd]">
            {viewMode === 'all'
              ? <><strong>회사명 클릭</strong>으로 바이어 인텔 확인 · <strong>✉ 메일 버튼</strong>으로 AI 초안 생성 후 발송</>
              : <>이메일 검증 실패 또는 Tier2 catch-all 도메인 목록입니다. 파이프라인에서 자동 제외됩니다.</>
            }
          </span>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="text-[#64748b] text-sm">바이어 DB 로딩 중...</div>
          </div>
        )}

        {/* Blacklist View */}
        {viewMode === 'blacklist' && (
          <div className="bg-[#1e293b] border border-[#334155] rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#334155]">
                    <th className="text-left px-4 py-3 font-semibold text-[#64748b]">도메인</th>
                    <th className="text-left px-4 py-3 font-semibold text-[#64748b]">회사명</th>
                    <th className="text-left px-4 py-3 font-semibold text-[#64748b]">사유</th>
                  </tr>
                </thead>
                <tbody>
                  {blacklistDomains.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-[#64748b]">
                        블랙리스트 도메인이 없습니다
                      </td>
                    </tr>
                  ) : (
                    blacklistDomains.map((bl, idx) => (
                      <tr key={idx} className="border-b border-[#334155] hover:bg-[#273549]">
                        <td className="px-4 py-3 text-[#ef4444] font-semibold">{bl.domain}</td>
                        <td className="px-4 py-3 text-[#94a3b8]">{bl.company}</td>
                        <td className="px-4 py-3 text-[#64748b]">{bl.reason}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Filters */}
        {viewMode === 'all' && <><div className="flex flex-wrap gap-2 items-center">
          <input
            type="text"
            placeholder="🔍  회사명 또는 담당자 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-[260px] bg-[#1e293b] border border-[#334155] text-[#e2e8f0] px-3 py-2 rounded-lg text-xs placeholder-[#64748b]"
          />
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="bg-[#1e293b] border border-[#334155] text-[#e2e8f0] px-3 py-2 rounded-lg text-xs"
          >
            <option value="">전체 리전</option>
            <option value="GCC">GCC</option>
            <option value="USA">USA</option>
            <option value="Europe">Europe</option>
          </select>
          <select
            value={tier}
            onChange={(e) => setTier(e.target.value)}
            className="bg-[#1e293b] border border-[#334155] text-[#e2e8f0] px-3 py-2 rounded-lg text-xs"
          >
            <option value="">전체 Tier</option>
            <option value="Tier1">Tier 1</option>
            <option value="Tier2">Tier 2</option>
            <option value="Tier3">Tier 3</option>
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="bg-[#1e293b] border border-[#334155] text-[#e2e8f0] px-3 py-2 rounded-lg text-xs"
          >
            <option value="">전체 상태</option>
            <option value="미발송">미발송</option>
            <option value="발송완료">발송완료</option>
            <option value="회신받음">회신받음</option>
          </select>
          <select
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="bg-[#1e293b] border border-[#334155] text-[#e2e8f0] px-3 py-2 rounded-lg text-xs"
          >
            <option value="">마지막 발송 — 전체</option>
            <option value="latest">최신순</option>
            <option value="month">이번 달</option>
            <option value="last">지난 달</option>
          </select>

          <div className="flex-1" />

          <span className="text-xs text-[#64748b] whitespace-nowrap">{displayCount}개 표시</span>
          <button
            onClick={() => { setSearch(''); setRegion(''); setTier(''); setStatus(''); setDate(''); }}
            className="bg-transparent border border-[#334155] text-[#64748b] px-3 py-2 rounded-lg text-xs hover:text-[#e2e8f0] transition"
          >
            ✕ 초기화
          </button>
          <button
            onClick={downloadCSV}
            className="bg-transparent border border-[#334155] text-[#94a3b8] px-3 py-2 rounded-lg text-xs hover:bg-[#334155]"
          >
            📥 CSV
          </button>
          <button
            onClick={() => setAddBuyerModalOpen(true)}
            className="bg-[#3b82f6] text-white px-3 py-2 rounded-lg text-xs font-semibold hover:bg-[#2563eb]"
          >
            + 수동 추가
          </button>
        </div>

        {/* Table */}
        <div className="bg-[#1e293b] border border-[#334155] rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#334155]">
                  <th className="text-left px-4 py-3 font-semibold text-[#64748b]">회사</th>
                  <th className="text-center px-2 py-3 font-semibold text-[#64748b]">사이트</th>
                  <th className="text-left px-4 py-3 font-semibold text-[#64748b]">리전</th>
                  <th className="text-left px-4 py-3 font-semibold text-[#64748b]">Tier</th>
                  <th className="text-left px-4 py-3 font-semibold text-[#64748b]">담당자</th>
                  <th className="text-center px-2 py-3 font-semibold text-[#64748b]">LinkedIn</th>
                  <th className="text-left px-4 py-3 font-semibold text-[#64748b]">직책</th>
                  <th className="text-left px-4 py-3 font-semibold text-[#64748b]">이메일</th>
                  <th className="text-left px-4 py-3 font-semibold text-[#64748b]">마지막 발송</th>
                  <th className="text-left px-4 py-3 font-semibold text-[#64748b]">상태</th>
                  <th className="text-center px-4 py-3 font-semibold text-[#64748b]">메일</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((buyer) => {
                  const mailButtonLabel = buyer.status === '회신받음' ? '팔로업' : buyer.status === '발송완료' ? '재발송' : '첫 발송';
                  const mailButtonColor = buyer.status === '회신받음'
                    ? 'bg-[#22c55e]/20 text-[#22c55e]'
                    : buyer.status === '발송완료'
                    ? 'bg-[#f59e0b]/20 text-[#f59e0b]'
                    : 'bg-[#3b82f6]/20 text-[#3b82f6]';

                  return (
                    <tr key={buyer.id} className="border-b border-[#334155] hover:bg-[#273549]">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-6 h-6 rounded bg-gradient-to-br ${getGradient(buyer.company)} flex items-center justify-center text-white font-bold text-xs flex-shrink-0`}
                          >
                            {buyer.company[0]}
                          </div>
                          <div>
                            {/* Clickable company name */}
                            <button
                              onClick={() => handleCompanyClick(buyer)}
                              className="font-semibold text-[#e2e8f0] hover:text-[#60a5fa] hover:underline text-left transition"
                              title="클릭하여 바이어 인텔 보기"
                            >
                              {buyer.company}
                            </button>
                            <div className="text-[#64748b]">{buyer.email.split('@')[1] || ''}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-3 text-center">
                        {buyer.domain ? (
                          <a
                            href={`https://${buyer.domain}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`https://${buyer.domain}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center justify-center w-7 h-7 rounded bg-[#3b82f6]/10 text-[#3b82f6] hover:bg-[#3b82f6]/20 transition"
                          >
                            🌐
                          </a>
                        ) : (
                          <span className="text-[#475569]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[#94a3b8]">{buyer.region}</td>
                      <td className="px-4 py-3 text-[#94a3b8]">{buyer.tierDisplay || buyer.tier}</td>
                      <td className="px-4 py-3 text-[#94a3b8]">{buyer.contact}</td>
                      <td className="px-2 py-3 text-center">
                        {buyer.linkedin_url ? (
                          <a
                            href={buyer.linkedin_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="LinkedIn 프로필 열기"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center justify-center w-7 h-7 rounded bg-[#0a66c2]/15 text-[#0a66c2] hover:bg-[#0a66c2]/25 transition text-xs font-bold"
                          >
                            in
                          </a>
                        ) : (
                          <span className="text-[#475569]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[#94a3b8]">{buyer.title}</td>
                      <td className="px-4 py-3 text-[#94a3b8]">{buyer.email}</td>
                      <td className="px-4 py-3 text-[#64748b]">{buyer.lastSent}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs px-2 py-1 rounded ${
                            buyer.status === '회신받음'
                              ? 'bg-[#22c55e]/20 text-[#22c55e]'
                              : buyer.status === '발송완료'
                              ? 'bg-[#f59e0b]/20 text-[#f59e0b]'
                              : 'bg-[#334155]/50 text-[#94a3b8]'
                          }`}
                        >
                          {buyer.status === '회신받음' ? '✓ 회신받음' : buyer.status === '발송완료' ? '📬 발송완료' : '미발송'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleEmailClick(buyer)}
                          className={`text-xs px-2 py-1 rounded font-semibold hover:opacity-80 transition ${mailButtonColor}`}
                        >
                          ✉ {mailButtonLabel}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="border-t border-[#334155] px-4 py-3 flex justify-between items-center text-xs text-[#64748b]">
            <span>총 {totalCount}개 바이어 · {displayCount}개 필터 · {PAGE_SIZE}개씩 표시</span>
            <div className="flex gap-2 items-center">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="bg-transparent border border-[#334155] text-[#64748b] px-2 py-1 rounded hover:bg-[#334155] disabled:opacity-30 disabled:cursor-not-allowed"
              >
                ← 이전
              </button>
              <span className="bg-[#334155] px-3 py-1 rounded">{page} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="bg-transparent border border-[#334155] text-[#64748b] px-2 py-1 rounded hover:bg-[#334155] disabled:opacity-30 disabled:cursor-not-allowed"
              >
                다음 →
              </button>
            </div>
          </div>
        </div></>}
      </div>

      {/* Email Compose Modal */}
      {selectedBuyer && (
        <EmailComposeModal
          isOpen={emailModalOpen}
          onClose={() => {
            setEmailModalOpen(false);
            setSelectedBuyer(null);
          }}
          buyer={selectedBuyer}
        />
      )}

      {/* Add Buyer Modal */}
      <AddBuyerModal
        isOpen={addBuyerModalOpen}
        onClose={() => setAddBuyerModalOpen(false)}
        onAdd={handleAddBuyer}
      />

      {/* Buyer Intel Drawer */}
      {intelBuyer && (
        <BuyerIntelDrawer
          isOpen={intelDrawerOpen}
          onClose={() => {
            setIntelDrawerOpen(false);
            setIntelBuyer(null);
          }}
          buyer={intelBuyer}
          onEmailClick={() => handleEmailClick(intelBuyer)}
        />
      )}
    </div>
  );
}
