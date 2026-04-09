'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface Contact {
  id?: string;
  contact_name: string;
  contact_title: string;
  contact_email: string;
  contact_linkedin?: string;
  is_primary?: boolean;
  source?: string;
}

interface BuyerIntelDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  buyer: {
    id: string;
    company: string;
    website: string;
    region: string;
    tier: string;
    status: string;
    contact: string;
    title: string;
    email: string;
  };
  onEmailClick?: () => void;
}

export default function BuyerIntelDrawer({ isOpen, onClose, buyer, onEmailClick }: BuyerIntelDrawerProps) {
  const [intel, setIntel] = useState<any>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [addingContact, setAddingContact] = useState(false);
  const [newContact, setNewContact] = useState({ contact_name: '', contact_title: '', contact_email: '', contact_linkedin: '' });
  const [savingContact, setSavingContact] = useState(false);

  useEffect(() => {
    if (!isOpen || !buyer) return;

    // Load intel
    setLoading(true);
    fetch('/api/buyer-intel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        buyerId: buyer.id,
        company_name: buyer.company,
        website: buyer.website,
        region: buyer.region,
        tier: buyer.tier,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        // Normalize field names (API returns camelCase, drawer expects snake_case)
        const raw = data.intel || {};
        setIntel({
          overview: raw.overview || '',
          products: typeof raw.products === 'string' ? raw.products.split(',').map((s: string) => s.trim()).filter(Boolean) : (raw.products || []),
          why_kbeauty: raw.why_kbeauty || raw.whyKBeauty || '',
          personalization_hooks: raw.personalization_hooks || raw.personalHooks || [],
          website_insights: raw.website_insights || raw.websiteInsights || '',
          tier_note: raw.tier_note || raw.tierNote || '',
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    // Load contacts from buyer_contacts table (fallback to main buyer contact)
    setContactsLoading(true);
    supabase
      .from('buyer_contacts')
      .select('*')
      .eq('buyer_id', buyer.id)
      .order('is_primary', { ascending: false })
      .then(({ data, error }) => {
        if (!error && data && data.length > 0) {
          setContacts(data);
        } else {
          // Fallback: use existing primary contact from buyers table
          if (buyer.contact) {
            setContacts([{
              contact_name: buyer.contact,
              contact_title: buyer.title,
              contact_email: buyer.email,
              is_primary: true,
              source: 'clay',
            }]);
          }
        }
        setContactsLoading(false);
      });
  }, [isOpen, buyer]);

  const handleAddContact = async () => {
    if (!newContact.contact_name || !newContact.contact_email) return;
    setSavingContact(true);
    try {
      const { data, error } = await supabase
        .from('buyer_contacts')
        .insert({
          buyer_id: buyer.id,
          contact_name: newContact.contact_name,
          contact_title: newContact.contact_title,
          contact_email: newContact.contact_email,
          contact_linkedin: newContact.contact_linkedin,
          is_primary: contacts.length === 0,
          source: 'manual',
        })
        .select()
        .single();

      if (!error && data) {
        setContacts((prev) => [...prev, data]);
        setNewContact({ contact_name: '', contact_title: '', contact_email: '', contact_linkedin: '' });
        setAddingContact(false);
      } else {
        alert('담당자 추가 실패: 먼저 Supabase에서 SQL 마이그레이션을 실행해주세요.');
      }
    } catch {
      alert('담당자 추가 중 오류가 발생했습니다.');
    } finally {
      setSavingContact(false);
    }
  };

  const handleDeleteContact = async (contactId: string | undefined, idx: number) => {
    if (!contactId) {
      setContacts((prev) => prev.filter((_, i) => i !== idx));
      return;
    }
    await supabase.from('buyer_contacts').delete().eq('id', contactId);
    setContacts((prev) => prev.filter((c) => c.id !== contactId));
  };

  if (!isOpen) return null;

  const tierColor = buyer.tier === 'Tier 1'
    ? 'text-[#22c55e] bg-[#22c55e]/10'
    : buyer.tier === 'Tier 2'
    ? 'text-[#f59e0b] bg-[#f59e0b]/10'
    : 'text-[#94a3b8] bg-[#334155]/50';

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-[480px] bg-[#0f172a] border-l border-[#334155] z-50 flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#334155] flex items-start justify-between flex-shrink-0 bg-[#1e293b]">
          <div>
            <div className="text-base font-bold text-[#f1f5f9]">{buyer.company}</div>
            <div className="flex items-center gap-2 mt-1.5">
              <span className={`text-xs px-2 py-0.5 rounded font-semibold ${tierColor}`}>
                {buyer.tier}
              </span>
              <span className="text-xs text-[#64748b]">·</span>
              <span className="text-xs text-[#64748b]">{buyer.region}</span>
              {buyer.website && (
                <>
                  <span className="text-xs text-[#64748b]">·</span>
                  <a
                    href={buyer.website.startsWith('http') ? buyer.website : `https://${buyer.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[#3b82f6] hover:underline"
                  >
                    {buyer.website.replace(/^https?:\/\//, '')}
                  </a>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onEmailClick && (
              <button
                onClick={() => { onClose(); setTimeout(onEmailClick, 100); }}
                className="text-xs bg-[#3b82f6] text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-[#2563eb] transition"
              >
                ✉ 메일 작성
              </button>
            )}
            <button
              onClick={onClose}
              className="text-[#64748b] hover:text-[#f1f5f9] text-xl font-bold leading-none"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Contacts Section */}
          <div className="px-6 py-5 border-b border-[#334155]">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-[#f1f5f9]">담당자 ({contacts.length}명)</div>
              <button
                onClick={() => setAddingContact(true)}
                className="text-xs text-[#3b82f6] hover:text-[#60a5fa] font-semibold"
              >
                + 담당자 추가
              </button>
            </div>

            {contactsLoading ? (
              <div className="text-xs text-[#64748b]">로딩 중...</div>
            ) : contacts.length === 0 ? (
              <div className="text-xs text-[#64748b] italic">담당자 정보 없음</div>
            ) : (
              <div className="space-y-2">
                {contacts.map((c, idx) => (
                  <div
                    key={c.id || idx}
                    className="bg-[#1e293b] border border-[#334155] rounded-lg px-4 py-3 flex items-start gap-3"
                  >
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#3b82f6] to-[#7c3aed] flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                      {c.contact_name?.[0] || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-[#f1f5f9]">{c.contact_name}</span>
                        {c.is_primary && (
                          <span className="text-xs bg-[#3b82f6]/20 text-[#60a5fa] px-1.5 py-0.5 rounded">주 담당자</span>
                        )}
                        {c.source && c.source !== 'manual' && (
                          <span className="text-xs bg-[#334155] text-[#94a3b8] px-1.5 py-0.5 rounded">{c.source}</span>
                        )}
                      </div>
                      {c.contact_title && <div className="text-xs text-[#64748b] mt-0.5">{c.contact_title}</div>}
                      {c.contact_email && (
                        <a href={`mailto:${c.contact_email}`} className="text-xs text-[#3b82f6] hover:underline mt-0.5 block">
                          {c.contact_email}
                        </a>
                      )}
                      {c.contact_linkedin && (
                        <a href={c.contact_linkedin} target="_blank" rel="noopener noreferrer" className="text-xs text-[#94a3b8] hover:text-[#e2e8f0] mt-0.5 block truncate">
                          LinkedIn
                        </a>
                      )}
                    </div>
                    <button
                      onClick={() => handleDeleteContact(c.id, idx)}
                      className="text-[#475569] hover:text-[#ef4444] text-xs transition"
                      title="삭제"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add Contact Form */}
            {addingContact && (
              <div className="mt-3 bg-[#1e293b] border border-[#3b82f6]/40 rounded-lg p-4 space-y-2">
                <div className="text-xs font-semibold text-[#60a5fa] mb-2">새 담당자 추가</div>
                <input
                  type="text"
                  placeholder="이름 *"
                  value={newContact.contact_name}
                  onChange={(e) => setNewContact({ ...newContact, contact_name: e.target.value })}
                  className="w-full text-xs bg-[#0f172a] border border-[#334155] text-[#e2e8f0] px-3 py-2 rounded focus:outline-none focus:border-[#3b82f6] placeholder-[#475569]"
                />
                <input
                  type="text"
                  placeholder="직책 (예: Head of Sourcing)"
                  value={newContact.contact_title}
                  onChange={(e) => setNewContact({ ...newContact, contact_title: e.target.value })}
                  className="w-full text-xs bg-[#0f172a] border border-[#334155] text-[#e2e8f0] px-3 py-2 rounded focus:outline-none focus:border-[#3b82f6] placeholder-[#475569]"
                />
                <input
                  type="email"
                  placeholder="이메일 *"
                  value={newContact.contact_email}
                  onChange={(e) => setNewContact({ ...newContact, contact_email: e.target.value })}
                  className="w-full text-xs bg-[#0f172a] border border-[#334155] text-[#e2e8f0] px-3 py-2 rounded focus:outline-none focus:border-[#3b82f6] placeholder-[#475569]"
                />
                <input
                  type="url"
                  placeholder="LinkedIn URL (선택)"
                  value={newContact.contact_linkedin}
                  onChange={(e) => setNewContact({ ...newContact, contact_linkedin: e.target.value })}
                  className="w-full text-xs bg-[#0f172a] border border-[#334155] text-[#e2e8f0] px-3 py-2 rounded focus:outline-none focus:border-[#3b82f6] placeholder-[#475569]"
                />
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleAddContact}
                    disabled={savingContact || !newContact.contact_name || !newContact.contact_email}
                    className="flex-1 text-xs bg-[#3b82f6] text-white py-1.5 rounded font-semibold hover:bg-[#2563eb] disabled:opacity-50 transition"
                  >
                    {savingContact ? '저장 중...' : '저장'}
                  </button>
                  <button
                    onClick={() => setAddingContact(false)}
                    className="text-xs border border-[#334155] text-[#64748b] px-4 py-1.5 rounded hover:bg-[#334155] transition"
                  >
                    취소
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Intel Section */}
          <div className="px-6 py-5">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-semibold text-[#f1f5f9]">🔍 바이어 인텔</div>
              {intel && !loading && (
                <button
                  onClick={() => {
                    setIntel(null);
                    setLoading(true);
                    fetch('/api/buyer-intel', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        buyerId: null, // skip cache
                        company_name: buyer.company,
                        website: buyer.website,
                        region: buyer.region,
                        tier: buyer.tier,
                      }),
                    })
                      .then((r) => r.json())
                      .then((data) => {
                        const raw = data.intel || {};
                        setIntel({
                          overview: raw.overview || '',
                          products: typeof raw.products === 'string' ? raw.products.split(',').map((s: string) => s.trim()).filter(Boolean) : (raw.products || []),
                          why_kbeauty: raw.why_kbeauty || raw.whyKBeauty || '',
                          personalization_hooks: raw.personalization_hooks || raw.personalHooks || [],
                          website_insights: raw.website_insights || raw.websiteInsights || '',
                          tier_note: raw.tier_note || raw.tierNote || '',
                        });
                      })
                      .catch(() => {})
                      .finally(() => setLoading(false));
                  }}
                  className="text-xs text-[#64748b] hover:text-[#94a3b8] transition"
                >
                  🔄 새로 분석
                </button>
              )}
            </div>

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-[#1e293b] border border-[#334155] rounded-lg p-4 animate-pulse">
                    <div className="h-3 bg-[#334155] rounded w-1/3 mb-2"></div>
                    <div className="h-3 bg-[#334155] rounded w-full mb-1"></div>
                    <div className="h-3 bg-[#334155] rounded w-4/5"></div>
                  </div>
                ))}
                <div className="text-xs text-[#64748b] text-center mt-2">
                  🤖 Claude AI가 {buyer.company} 분석 중...
                </div>
              </div>
            ) : intel ? (
              <div className="space-y-4">
                {/* Overview */}
                <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-4">
                  <div className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wide mb-2">회사 개요</div>
                  <p className="text-xs text-[#e2e8f0] leading-relaxed">{intel.overview}</p>
                </div>

                {/* Products */}
                {intel.products && intel.products.length > 0 && (
                  <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-4">
                    <div className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wide mb-2">주요 제품 카테고리</div>
                    <div className="flex flex-wrap gap-2">
                      {intel.products.map((p: string, i: number) => (
                        <span key={i} className="text-xs bg-[#334155] text-[#94a3b8] px-2 py-1 rounded">
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Why K-Beauty */}
                <div className="bg-[#1e3a5f30] border border-[#3b82f640] rounded-lg p-4">
                  <div className="text-xs font-semibold text-[#60a5fa] uppercase tracking-wide mb-2">💡 K-Beauty OEM 기회</div>
                  <p className="text-xs text-[#93c5fd] leading-relaxed">{intel.why_kbeauty}</p>
                </div>

                {/* Personalization Hooks */}
                {intel.personalization_hooks && intel.personalization_hooks.length > 0 && (
                  <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-4">
                    <div className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wide mb-2">✉ 이메일 개인화 포인트</div>
                    <ul className="space-y-2">
                      {intel.personalization_hooks.map((hook: string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-[#e2e8f0]">
                          <span className="text-[#22c55e] font-bold flex-shrink-0 mt-0.5">{i + 1}.</span>
                          <span className="leading-relaxed">{hook}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Website Insights */}
                {intel.website_insights && (
                  <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-4">
                    <div className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wide mb-2">🌐 웹사이트 인사이트</div>
                    <p className="text-xs text-[#94a3b8] leading-relaxed">{intel.website_insights}</p>
                  </div>
                )}

                {/* Tier Note */}
                {intel.tier_note && (
                  <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-4">
                    <div className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wide mb-2">📋 영업 전략 노트</div>
                    <p className="text-xs text-[#94a3b8] leading-relaxed">{intel.tier_note}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-[#64748b] text-center py-8">
                인텔 데이터를 불러올 수 없습니다.
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
