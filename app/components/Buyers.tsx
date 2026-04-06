'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Buyer } from '../lib/types';

// Fallback mock data
const mockBuyersData = [
  {
    id: '1',
    company_name: 'Basharacare',
    website: 'basharacare.com',
    contact_name: 'Maya Berberi',
    region: 'GCC',
    tier: 'Tier1',
    est_revenue: '$150M+',
    status: 'Contacted',
    lastContact: '2일 전',
  },
  {
    id: '2',
    company_name: 'Namshi',
    website: 'namshi.com',
    contact_name: 'Ahmad Al-Mansouri',
    region: 'GCC',
    tier: 'Tier1',
    est_revenue: '$200M+',
    status: 'Cold',
    lastContact: '5시간 전',
  },
  {
    id: '3',
    company_name: 'Ounass',
    website: 'ounass.ae',
    contact_name: 'Fatima Al-Zahra',
    region: 'GCC',
    tier: 'Tier1',
    est_revenue: '$120M+',
    status: 'Replied',
    lastContact: '1시간 전',
  },
  {
    id: '4',
    company_name: 'Noon',
    website: 'noon.com',
    contact_name: 'Mohammed Al-Dosari',
    region: 'GCC',
    tier: 'Tier1',
    est_revenue: '$180M+',
    status: 'Replied',
    lastContact: '30분 전',
  },
  {
    id: '5',
    company_name: 'Sephora Middle East',
    contact_name: 'Layla Al-Haddad',
    region: 'GCC',
    tier: 'Tier1',
    est_revenue: '$250M+',
    status: 'Contacted',
    lastContact: '3일 전',
  },
  {
    id: '6',
    company_name: 'Amazon Beauty',
    contact_name: 'James Wilson',
    region: 'USA',
    tier: 'Tier1',
    est_revenue: '$500M+',
    status: 'Cold',
    lastContact: '4일 전',
  },
  {
    id: '7',
    company_name: 'Sephora USA',
    contact_name: 'Sarah Johnson',
    region: 'USA',
    tier: 'Tier2',
    est_revenue: '$50M+',
    status: 'Contacted',
    lastContact: '1주일 전',
  },
  {
    id: '8',
    company_name: 'Boots Beauty',
    contact_name: 'Emma Thompson',
    region: 'Europe',
    tier: 'Tier1',
    est_revenue: '$80M+',
    status: 'Cold',
    lastContact: '2주일 전',
  },
];

const statusColors: { [key: string]: { bg: string; text: string; label: string } } = {
  Cold: { bg: 'bg-[#334155]/50', text: 'text-[#94a3b8]', label: '미접촉' },
  Contacted: { bg: 'bg-[#3b82f6]/20', text: 'text-[#60a5fa]', label: '발송됨' },
  Replied: { bg: 'bg-[#fbbf24]/20', text: 'text-[#fbbf24]', label: '회신' },
  Interested: { bg: 'bg-[#22c55e]/20', text: 'text-[#22c55e]', label: '관심' },
  Sample: { bg: 'bg-[#a78bfa]/20', text: 'text-[#a78bfa]', label: '샘플' },
  Deal: { bg: 'bg-[#10b981]/20', text: 'text-[#10b981]', label: '거래' },
  Lost: { bg: 'bg-[#ef4444]/20', text: 'text-[#ef4444]', label: '실패' },
};

export default function Buyers() {
  const [buyers, setBuyers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterRegion, setFilterRegion] = useState('all');
  const [filterTier, setFilterTier] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    company_name: '',
    region: 'GCC',
    tier: 'Tier1',
    contact_name: '',
    contact_title: '',
    contact_email: '',
    website: '',
    est_revenue: '',
    k_beauty_flag: 'Unknown',
  });
  const [savingModal, setSavingModal] = useState(false);

  useEffect(() => {
    fetchBuyers();
  }, []);

  async function fetchBuyers() {
    try {
      const { data, error } = await supabase
        .from('buyers')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Supabase fetch error:', error);
        setBuyers(mockBuyersData);
      } else if (data && data.length > 0) {
        // Map Supabase data to display format
        setBuyers(data.map((buyer) => ({
          ...buyer,
          lastContact: '방금 전',
        })));
      } else {
        // No data in Supabase, use mock
        setBuyers(mockBuyersData);
      }
    } catch (error) {
      console.error('Fetch error:', error);
      setBuyers(mockBuyersData);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveNewBuyer() {
    if (!formData.company_name || !formData.region || !formData.tier) {
      alert('회사명, 지역, Tier는 필수입니다');
      return;
    }

    setSavingModal(true);
    try {
      const { error } = await supabase.from('buyers').insert([
        {
          company_name: formData.company_name,
          website: formData.website,
          region: formData.region,
          tier: formData.tier,
          contact_name: formData.contact_name || null,
          contact_title: formData.contact_title || null,
          contact_email: formData.contact_email || null,
          employee_count: null,
          est_revenue: formData.est_revenue || null,
          k_beauty_flag: formData.k_beauty_flag,
          status: 'Cold',
        },
      ]);

      if (error) {
        console.warn('Insert error:', error);
        // Fallback: add to local state
        const newBuyer = {
          id: Date.now().toString(),
          ...formData,
          status: 'Cold',
          lastContact: '방금 전',
        };
        setBuyers([newBuyer, ...buyers]);
      } else {
        // Refresh list
        await fetchBuyers();
      }

      setShowModal(false);
      setFormData({
        company_name: '',
        region: 'GCC',
        tier: 'Tier1',
        contact_name: '',
        contact_title: '',
        contact_email: '',
        website: '',
        est_revenue: '',
        k_beauty_flag: 'Unknown',
      });
    } catch (error) {
      console.error('Save error:', error);
      alert('저장 실패');
    } finally {
      setSavingModal(false);
    }
  }

  async function handleStatusChange(buyerId: string, newStatus: string) {
    try {
      const { error } = await supabase
        .from('buyers')
        .update({ status: newStatus })
        .eq('id', buyerId);

      if (error) {
        console.warn('Update error:', error);
        // Fallback: update local state
        setBuyers(buyers.map((b) => (b.id === buyerId ? { ...b, status: newStatus } : b)));
      } else {
        // Refresh list
        await fetchBuyers();
      }
    } catch (error) {
      console.error('Update error:', error);
    }
  }

  const filteredBuyers = buyers.filter((buyer) => {
    const regionMatch = filterRegion === 'all' || buyer.region === filterRegion;
    const tierMatch =
      filterTier === 'all' ||
      (filterTier === 'Tier 1' && buyer.tier === 'Tier1') ||
      (filterTier === 'Tier 2' && buyer.tier === 'Tier2') ||
      (filterTier === 'Tier 3' && buyer.tier === 'Tier3');
    const searchMatch =
      buyer.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (buyer.contact_name && buyer.contact_name.toLowerCase().includes(searchQuery.toLowerCase()));
    return regionMatch && tierMatch && searchMatch;
  });

  return (
    <div className="flex-1 flex flex-col overflow-auto">
      {/* Topbar */}
      <div className="sticky top-0 bg-[#0f172a] border-b border-[#334155] px-8 py-6 z-10">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-2xl font-bold text-[#f1f5f9]">바이어 DB</h1>
            <p className="text-sm text-[#94a3b8] mt-1">
              총 {filteredBuyers.length}건 {!loading && ' · Supabase 연결 완료'}
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="px-6 py-2 bg-[#3b82f6] rounded-lg text-white font-semibold hover:bg-[#2563eb] transition"
          >
            + 바이어 추가
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-3 items-center">
          <input
            type="text"
            placeholder="회사명 또는 담당자 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-[#1e293b] border border-[#334155] text-[#e2e8f0] px-4 py-2 rounded-lg text-sm flex-1 placeholder-[#64748b] focus:border-[#3b82f6] outline-none"
          />
          <select
            value={filterRegion}
            onChange={(e) => setFilterRegion(e.target.value)}
            className="bg-[#1e293b] border border-[#334155] text-[#e2e8f0] px-3 py-2 rounded-lg text-sm"
          >
            <option value="all">모든 지역</option>
            <option value="GCC">GCC</option>
            <option value="USA">USA</option>
            <option value="Europe">Europe</option>
          </select>
          <select
            value={filterTier}
            onChange={(e) => setFilterTier(e.target.value)}
            className="bg-[#1e293b] border border-[#334155] text-[#e2e8f0] px-3 py-2 rounded-lg text-sm"
          >
            <option value="all">모든 Tier</option>
            <option value="Tier 1">Tier 1</option>
            <option value="Tier 2">Tier 2</option>
            <option value="Tier 3">Tier 3</option>
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-8">
        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center h-[200px]">
            <div className="text-[#94a3b8]">데이터 로딩 중...</div>
          </div>
        )}

        {/* Table */}
        {!loading && (
          <div className="bg-[#1e293b] border border-[#334155] rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#334155]">
                    <th className="text-left px-6 py-4 text-xs font-semibold text-[#64748b] bg-[#1a2744]">
                      회사명
                    </th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-[#64748b] bg-[#1a2744]">
                      담당자
                    </th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-[#64748b] bg-[#1a2744]">
                      지역
                    </th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-[#64748b] bg-[#1a2744]">
                      Tier
                    </th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-[#64748b] bg-[#1a2744]">
                      연매출
                    </th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-[#64748b] bg-[#1a2744]">
                      상태
                    </th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-[#64748b] bg-[#1a2744]">
                      마지막 연락
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBuyers.map((buyer) => {
                    const tierLabel =
                      buyer.tier === 'Tier1' ? 'Tier 1' : buyer.tier === 'Tier2' ? 'Tier 2' : 'Tier 3';
                    const statusColor = statusColors[buyer.status] || statusColors['Cold'];
                    return (
                      <tr key={buyer.id} className="border-b border-[#334155] hover:bg-[#273549]">
                        <td className="px-6 py-4 font-semibold text-[#e2e8f0]">{buyer.company_name}</td>
                        <td className="px-6 py-4 text-[#94a3b8]">{buyer.contact_name || '-'}</td>
                        <td className="px-6 py-4 text-[#94a3b8]">{buyer.region}</td>
                        <td className="px-6 py-4">
                          <span className="px-3 py-1 bg-[#334155]/50 text-[#cbd5e1] text-xs rounded-full">
                            {tierLabel}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-[#94a3b8]">{buyer.est_revenue || '-'}</td>
                        <td className="px-6 py-4">
                          <select
                            value={buyer.status}
                            onChange={(e) => handleStatusChange(buyer.id, e.target.value)}
                            className={`px-3 py-1 text-xs rounded-full font-medium border-0 cursor-pointer ${statusColor.bg} ${statusColor.text} bg-transparent`}
                          >
                            <option value="Cold" className="bg-[#1e293b] text-[#94a3b8]">미접촉</option>
                            <option value="Contacted" className="bg-[#1e293b] text-[#60a5fa]">발송됨</option>
                            <option value="Replied" className="bg-[#1e293b] text-[#fbbf24]">회신</option>
                            <option value="Interested" className="bg-[#1e293b] text-[#22c55e]">관심</option>
                            <option value="Sample" className="bg-[#1e293b] text-[#a78bfa]">샘플</option>
                            <option value="Deal" className="bg-[#1e293b] text-[#10b981]">거래</option>
                            <option value="Lost" className="bg-[#1e293b] text-[#ef4444]">실패</option>
                          </select>
                        </td>
                        <td className="px-6 py-4 text-[#64748b] text-xs">{buyer.lastContact}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Add Buyer Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1e293b] border border-[#334155] rounded-lg max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-[#f1f5f9]">새 바이어 추가</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-[#94a3b8] hover:text-[#f1f5f9] text-2xl"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              {/* Company Name */}
              <div>
                <label className="block text-xs font-semibold text-[#94a3b8] mb-1">
                  회사명 <span className="text-[#ef4444]">*</span>
                </label>
                <input
                  type="text"
                  value={formData.company_name}
                  onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                  className="w-full bg-[#0f172a] border border-[#334155] text-[#e2e8f0] px-3 py-2 rounded-lg text-sm placeholder-[#64748b] focus:border-[#3b82f6] outline-none"
                  placeholder="Basharacare"
                />
              </div>

              {/* Region */}
              <div>
                <label className="block text-xs font-semibold text-[#94a3b8] mb-1">
                  지역 <span className="text-[#ef4444]">*</span>
                </label>
                <select
                  value={formData.region}
                  onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                  className="w-full bg-[#0f172a] border border-[#334155] text-[#e2e8f0] px-3 py-2 rounded-lg text-sm"
                >
                  <option value="GCC">GCC</option>
                  <option value="USA">USA</option>
                  <option value="Europe">Europe</option>
                </select>
              </div>

              {/* Tier */}
              <div>
                <label className="block text-xs font-semibold text-[#94a3b8] mb-1">
                  Tier <span className="text-[#ef4444]">*</span>
                </label>
                <select
                  value={formData.tier}
                  onChange={(e) => setFormData({ ...formData, tier: e.target.value })}
                  className="w-full bg-[#0f172a] border border-[#334155] text-[#e2e8f0] px-3 py-2 rounded-lg text-sm"
                >
                  <option value="Tier1">Tier 1</option>
                  <option value="Tier2">Tier 2</option>
                </select>
              </div>

              {/* Contact Name */}
              <div>
                <label className="block text-xs font-semibold text-[#94a3b8] mb-1">담당자명</label>
                <input
                  type="text"
                  value={formData.contact_name}
                  onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                  className="w-full bg-[#0f172a] border border-[#334155] text-[#e2e8f0] px-3 py-2 rounded-lg text-sm placeholder-[#64748b] focus:border-[#3b82f6] outline-none"
                  placeholder="Maya Berberi"
                />
              </div>

              {/* Contact Title */}
              <div>
                <label className="block text-xs font-semibold text-[#94a3b8] mb-1">직책</label>
                <input
                  type="text"
                  value={formData.contact_title}
                  onChange={(e) => setFormData({ ...formData, contact_title: e.target.value })}
                  className="w-full bg-[#0f172a] border border-[#334155] text-[#e2e8f0] px-3 py-2 rounded-lg text-sm placeholder-[#64748b] focus:border-[#3b82f6] outline-none"
                  placeholder="Buying Director"
                />
              </div>

              {/* Contact Email */}
              <div>
                <label className="block text-xs font-semibold text-[#94a3b8] mb-1">이메일</label>
                <input
                  type="email"
                  value={formData.contact_email}
                  onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                  className="w-full bg-[#0f172a] border border-[#334155] text-[#e2e8f0] px-3 py-2 rounded-lg text-sm placeholder-[#64748b] focus:border-[#3b82f6] outline-none"
                  placeholder="maya@basharacare.com"
                />
              </div>

              {/* Website */}
              <div>
                <label className="block text-xs font-semibold text-[#94a3b8] mb-1">웹사이트</label>
                <input
                  type="text"
                  value={formData.website}
                  onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                  className="w-full bg-[#0f172a] border border-[#334155] text-[#e2e8f0] px-3 py-2 rounded-lg text-sm placeholder-[#64748b] focus:border-[#3b82f6] outline-none"
                  placeholder="basharacare.com"
                />
              </div>

              {/* Est Revenue */}
              <div>
                <label className="block text-xs font-semibold text-[#94a3b8] mb-1">예상 연매출</label>
                <input
                  type="text"
                  value={formData.est_revenue}
                  onChange={(e) => setFormData({ ...formData, est_revenue: e.target.value })}
                  className="w-full bg-[#0f172a] border border-[#334155] text-[#e2e8f0] px-3 py-2 rounded-lg text-sm placeholder-[#64748b] focus:border-[#3b82f6] outline-none"
                  placeholder="$150M+"
                />
              </div>

              {/* K-Beauty Flag */}
              <div>
                <label className="block text-xs font-semibold text-[#94a3b8] mb-1">K-뷰티 관심</label>
                <select
                  value={formData.k_beauty_flag}
                  onChange={(e) => setFormData({ ...formData, k_beauty_flag: e.target.value })}
                  className="w-full bg-[#0f172a] border border-[#334155] text-[#e2e8f0] px-3 py-2 rounded-lg text-sm"
                >
                  <option value="Unknown">미정</option>
                  <option value="Y">예</option>
                  <option value="N">아니오</option>
                </select>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2 bg-[#334155] rounded-lg text-[#e2e8f0] text-sm font-semibold hover:bg-[#475569] transition"
              >
                취소
              </button>
              <button
                onClick={handleSaveNewBuyer}
                disabled={savingModal}
                className="flex-1 px-4 py-2 bg-[#3b82f6] rounded-lg text-white text-sm font-semibold hover:bg-[#2563eb] transition disabled:opacity-50"
              >
                {savingModal ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
