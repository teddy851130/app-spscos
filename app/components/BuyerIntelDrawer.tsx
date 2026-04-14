'use client';

import { useState, useEffect } from 'react';
import { Check, X, Search, Bot, Building2, Lightbulb, FlaskConical, Target, MailOpen, ClipboardList, FileText } from 'lucide-react';
import { supabase } from '../lib/supabase';

// recent_news JSON → UI 표준 형태({overview, products, why_kbeauty, tier_note})
// agentC가 가끔 `{raw: "```json {...} ```"}` 형태로 저장하므로 클라이언트에서 재파싱
export function parseIntelJson(raw: any): any | null {
  if (!raw) return null;

  // 1) raw가 string이면 먼저 JSON.parse 시도
  let obj: any = raw;
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw); } catch { obj = { raw }; }
  }

  // 2) {raw: "..."} 형태면 내부 raw를 한 번 더 파싱 (```json 블록 포함)
  if (obj && typeof obj === 'object' && !obj.company_status && typeof obj.raw === 'string') {
    const text = obj.raw as string;
    const codeMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const candidate = codeMatch ? codeMatch[1] : text;
    const braceMatch = candidate.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      try { obj = JSON.parse(braceMatch[0]); } catch { /* keep as-is */ }
    }
  }

  if (!obj || typeof obj !== 'object') return null;

  // company_status 가 여전히 없으면 분석 실패로 간주
  if (!obj.company_status && !obj.overview) return null;

  return {
    overview: obj.company_status || obj.overview || '',
    products: obj.recommended_formula
      ? (typeof obj.recommended_formula === 'string'
        ? obj.recommended_formula.split(',').map((s: string) => s.trim()).filter(Boolean)
        : Array.isArray(obj.recommended_formula) ? obj.recommended_formula : [])
      : (typeof obj.products === 'string'
        ? obj.products.split(',').map((s: string) => s.trim()).filter(Boolean)
        : (obj.products || [])),
    why_kbeauty: obj.kbeauty_interest || obj.why_kbeauty || '',
    tier_note: obj.proposal_angle || obj.tier_note || '',
    raw: obj,
  };
}

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

interface BuyerBaseInfo {
  annual_revenue: string | null;
  employee_count: number | null;
  team: string | null;
}

interface DraftDrafts {
  subject: string;
  body: string;
}

export default function BuyerIntelDrawer({ isOpen, onClose, buyer, onEmailClick }: BuyerIntelDrawerProps) {
  const [intel, setIntel] = useState<any>(null);
  const [baseInfo, setBaseInfo] = useState<BuyerBaseInfo | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [addingContact, setAddingContact] = useState(false);
  const [newContact, setNewContact] = useState({ contact_name: '', contact_title: '', contact_email: '', contact_linkedin: '' });
  const [savingContact, setSavingContact] = useState(false);

  // 국문 초안 → 영문 번역 플로우 (#6)
  const [draftKo, setDraftKo] = useState<DraftDrafts | null>(null);
  const [generatingKo, setGeneratingKo] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftSaved, setDraftSaved] = useState(false);

  useEffect(() => {
    if (!isOpen || !buyer) return;

    // Reset draft flow state on open
    setDraftKo(null);
    setDraftError(null);
    setDraftSaved(false);

    // Load intel + base info from buyers (Agent C 분석 결과 + 기본 정보)
    setLoading(true);
    supabase
      .from('buyers')
      .select('recent_news, annual_revenue, employee_count, team')
      .eq('id', buyer.id)
      .single()
      .then(({ data }) => {
        setBaseInfo({
          annual_revenue: data?.annual_revenue ?? null,
          employee_count: data?.employee_count ?? null,
          team: data?.team ?? null,
        });
        const parsed = parseIntelJson(data?.recent_news);
        setIntel(parsed);
        setLoading(false);
      });

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

  // 국문 초안 생성 — generate-draft Edge Function 호출 (action=generate_ko)
  const handleGenerateKo = async () => {
    if (!intel || contacts.length === 0) return;
    setGeneratingKo(true);
    setDraftError(null);
    setDraftKo(null);
    setDraftSaved(false);
    try {
      const primaryContact = contacts.find((c) => c.is_primary) || contacts[0];
      const { data, error } = await supabase.functions.invoke('generate-draft', {
        body: {
          action: 'generate_ko',
          buyer: {
            id: buyer.id,
            company_name: buyer.company,
            region: buyer.region,
            tier: buyer.tier,
            website: buyer.website,
            annual_revenue: baseInfo?.annual_revenue,
            employee_count: baseInfo?.employee_count,
          },
          contact: {
            contact_name: primaryContact.contact_name,
            contact_title: primaryContact.contact_title,
            contact_email: primaryContact.contact_email,
          },
          intel: intel.raw || {},
        },
      });
      if (error) throw new Error(error.message || 'Edge Function 호출 실패');
      if (!data?.ko_subject || !data?.ko_body) throw new Error('국문 초안 응답 형식 오류');
      setDraftKo({ subject: data.ko_subject, body: data.ko_body });
    } catch (e) {
      setDraftError(e instanceof Error ? e.message : '국문 초안 생성 실패');
    } finally {
      setGeneratingKo(false);
    }
  };

  // 영문 번역 + email_drafts INSERT — generate-draft Edge Function 호출 (action=translate_save)
  const handleTranslateSave = async () => {
    if (!draftKo || contacts.length === 0) return;
    setTranslating(true);
    setDraftError(null);
    try {
      const primaryContact = contacts.find((c) => c.is_primary) || contacts[0];
      const { data, error } = await supabase.functions.invoke('generate-draft', {
        body: {
          action: 'translate_save',
          buyer: {
            id: buyer.id,
            company_name: buyer.company,
            tier: buyer.tier,
          },
          contact: {
            id: primaryContact.id,
            contact_name: primaryContact.contact_name,
          },
          ko_draft: draftKo,
        },
      });
      if (error) throw new Error(error.message || 'Edge Function 호출 실패');
      if (!data?.success) throw new Error(data?.message || '번역/저장 실패');
      setDraftSaved(true);
    } catch (e) {
      setDraftError(e instanceof Error ? e.message : '영문 번역/저장 실패');
    } finally {
      setTranslating(false);
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
    : 'text-[#697386] bg-[#e3e8ee]/50';

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-[480px] bg-[#f6f8fa] border-l border-[#e3e8ee] z-50 flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#e3e8ee] flex items-start justify-between flex-shrink-0 bg-[#ffffff]">
          <div>
            <div className="text-base font-bold text-[#1a1f36]">{buyer.company}</div>
            <div className="flex items-center gap-2 mt-1.5">
              <span className={`text-xs px-2 py-0.5 rounded font-semibold ${tierColor}`}>
                {buyer.tier}
              </span>
              <span className="text-xs text-[#8792a2]">·</span>
              <span className="text-xs text-[#8792a2]">{buyer.region}</span>
              {buyer.website && (
                <>
                  <span className="text-xs text-[#8792a2]">·</span>
                  <a
                    href={buyer.website.startsWith('http') ? buyer.website : `https://${buyer.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[#635BFF] hover:underline"
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
                className="text-xs bg-[#635BFF] text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-[#5851DB] transition"
              >
                <MailOpen size={14} className="inline" /> 메일 작성
              </button>
            )}
            <button
              onClick={onClose}
              className="text-[#8792a2] hover:text-[#1a1f36] text-xl font-bold leading-none"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Contacts Section */}
          <div className="px-6 py-5 border-b border-[#e3e8ee]">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-[#1a1f36]">담당자 ({contacts.length}명)</div>
              <button
                onClick={() => setAddingContact(true)}
                className="text-xs text-[#635BFF] hover:text-[#7A73FF] font-semibold"
              >
                + 담당자 추가
              </button>
            </div>

            {contactsLoading ? (
              <div className="text-xs text-[#8792a2]">로딩 중...</div>
            ) : contacts.length === 0 ? (
              <div className="text-xs text-[#8792a2] italic">담당자 정보 없음</div>
            ) : (
              <div className="space-y-2">
                {contacts.map((c, idx) => (
                  <div
                    key={c.id || idx}
                    className="bg-[#ffffff] border border-[#e3e8ee] rounded-lg px-4 py-3 flex items-start gap-3"
                  >
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#635BFF] to-[#7c3aed] flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                      {c.contact_name?.[0] || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-[#1a1f36]">{c.contact_name}</span>
                        {c.is_primary && (
                          <span className="text-xs bg-[#635BFF]/20 text-[#7A73FF] px-1.5 py-0.5 rounded">주 담당자</span>
                        )}
                        {c.source && c.source !== 'manual' && (
                          <span className="text-xs bg-[#e3e8ee] text-[#697386] px-1.5 py-0.5 rounded">{c.source}</span>
                        )}
                      </div>
                      {c.contact_title && <div className="text-xs text-[#8792a2] mt-0.5">{c.contact_title}</div>}
                      {c.contact_email && (
                        <a href={`mailto:${c.contact_email}`} className="text-xs text-[#635BFF] hover:underline mt-0.5 block">
                          {c.contact_email}
                        </a>
                      )}
                      {c.contact_linkedin && (
                        <a href={c.contact_linkedin} target="_blank" rel="noopener noreferrer" className="text-xs text-[#697386] hover:text-[#1a1f36] mt-0.5 block truncate">
                          LinkedIn
                        </a>
                      )}
                    </div>
                    <button
                      onClick={() => handleDeleteContact(c.id, idx)}
                      className="text-[#8792a2] hover:text-[#ef4444] text-xs transition"
                      title="삭제"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add Contact Form */}
            {addingContact && (
              <div className="mt-3 bg-[#ffffff] border border-[#635BFF]/40 rounded-lg p-4 space-y-2">
                <div className="text-xs font-semibold text-[#7A73FF] mb-2">새 담당자 추가</div>
                <input
                  type="text"
                  placeholder="이름 *"
                  value={newContact.contact_name}
                  onChange={(e) => setNewContact({ ...newContact, contact_name: e.target.value })}
                  className="w-full text-xs bg-[#f6f8fa] border border-[#e3e8ee] text-[#1a1f36] px-3 py-2 rounded focus:outline-none focus:border-[#635BFF] placeholder-[#8792a2]"
                />
                <input
                  type="text"
                  placeholder="직책 (예: Head of Sourcing)"
                  value={newContact.contact_title}
                  onChange={(e) => setNewContact({ ...newContact, contact_title: e.target.value })}
                  className="w-full text-xs bg-[#f6f8fa] border border-[#e3e8ee] text-[#1a1f36] px-3 py-2 rounded focus:outline-none focus:border-[#635BFF] placeholder-[#8792a2]"
                />
                <input
                  type="email"
                  placeholder="이메일 *"
                  value={newContact.contact_email}
                  onChange={(e) => setNewContact({ ...newContact, contact_email: e.target.value })}
                  className="w-full text-xs bg-[#f6f8fa] border border-[#e3e8ee] text-[#1a1f36] px-3 py-2 rounded focus:outline-none focus:border-[#635BFF] placeholder-[#8792a2]"
                />
                <input
                  type="url"
                  placeholder="LinkedIn URL (선택)"
                  value={newContact.contact_linkedin}
                  onChange={(e) => setNewContact({ ...newContact, contact_linkedin: e.target.value })}
                  className="w-full text-xs bg-[#f6f8fa] border border-[#e3e8ee] text-[#1a1f36] px-3 py-2 rounded focus:outline-none focus:border-[#635BFF] placeholder-[#8792a2]"
                />
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleAddContact}
                    disabled={savingContact || !newContact.contact_name || !newContact.contact_email}
                    className="flex-1 text-xs bg-[#635BFF] text-white py-1.5 rounded font-semibold hover:bg-[#5851DB] disabled:opacity-50 transition"
                  >
                    {savingContact ? '저장 중...' : '저장'}
                  </button>
                  <button
                    onClick={() => setAddingContact(false)}
                    className="text-xs border border-[#e3e8ee] text-[#8792a2] px-4 py-1.5 rounded hover:bg-[#e3e8ee] transition"
                  >
                    취소
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Base Info Section — 항상 표시 (#5) */}
          <div className="px-6 py-5 border-b border-[#e3e8ee]">
            <div className="text-sm font-semibold text-[#1a1f36] mb-3"><ClipboardList size={16} className="inline" /> 기본 정보</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#ffffff] border border-[#e3e8ee] rounded-lg px-3 py-2">
                <div className="text-xs text-[#8792a2] mb-0.5">Tier</div>
                <div className="text-xs font-semibold text-[#1a1f36]">{buyer.tier || '—'}</div>
              </div>
              <div className="bg-[#ffffff] border border-[#e3e8ee] rounded-lg px-3 py-2">
                <div className="text-xs text-[#8792a2] mb-0.5">팀</div>
                <div className="text-xs font-semibold text-[#1a1f36]">{baseInfo?.team || buyer.region || '—'}</div>
              </div>
              <div className="bg-[#ffffff] border border-[#e3e8ee] rounded-lg px-3 py-2">
                <div className="text-xs text-[#8792a2] mb-0.5">매출 규모</div>
                <div className="text-xs font-semibold text-[#1a1f36]">{baseInfo?.annual_revenue || '—'}</div>
              </div>
              <div className="bg-[#ffffff] border border-[#e3e8ee] rounded-lg px-3 py-2">
                <div className="text-xs text-[#8792a2] mb-0.5">직원 수</div>
                <div className="text-xs font-semibold text-[#1a1f36]">{baseInfo?.employee_count ? baseInfo.employee_count.toLocaleString() : '—'}</div>
              </div>
              <div className="bg-[#ffffff] border border-[#e3e8ee] rounded-lg px-3 py-2 col-span-2">
                <div className="text-xs text-[#8792a2] mb-0.5">도메인</div>
                <div className="text-xs font-semibold text-[#1a1f36] truncate">{buyer.website?.replace(/^https?:\/\//, '') || '—'}</div>
              </div>
            </div>
          </div>

          {/* Intel Section */}
          <div className="px-6 py-5">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-semibold text-[#1a1f36]"><Search size={16} className="inline" /> 바이어 인텔</div>
              {!loading && (
                <span className="text-xs text-[#8792a2]">
                  파이프라인 직원C 분석 결과
                </span>
              )}
            </div>

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-[#ffffff] border border-[#e3e8ee] rounded-lg p-4 animate-pulse">
                    <div className="h-3 bg-[#e3e8ee] rounded w-1/3 mb-2"></div>
                    <div className="h-3 bg-[#e3e8ee] rounded w-full mb-1"></div>
                    <div className="h-3 bg-[#e3e8ee] rounded w-4/5"></div>
                  </div>
                ))}
                <div className="text-xs text-[#8792a2] text-center mt-2">
                  <Bot size={16} className="inline text-[#635BFF]" /> Claude AI가 {buyer.company} 분석 중...
                </div>
              </div>
            ) : intel ? (
              <div className="space-y-4">
                {/* 회사 현황 (company_status) */}
                <div className="bg-[#ffffff] border border-[#e3e8ee] rounded-lg p-4">
                  <div className="text-xs font-semibold text-[#697386] uppercase tracking-wide mb-2"><Building2 size={14} className="inline" /> 회사 현황</div>
                  <p className="text-xs text-[#1a1f36] leading-relaxed whitespace-pre-wrap">
                    {intel.overview || '정보 없음'}
                  </p>
                </div>

                {/* K-beauty 관심도 (kbeauty_interest) */}
                <div className="bg-[#f0f0ff30] border border-[#635BFF40] rounded-lg p-4">
                  <div className="text-xs font-semibold text-[#7A73FF] uppercase tracking-wide mb-2"><Lightbulb size={14} className="inline text-[#f59e0b]" /> K-beauty 관심도</div>
                  <p className="text-xs text-[#93c5fd] leading-relaxed whitespace-pre-wrap">
                    {intel.why_kbeauty || '정보 없음'}
                  </p>
                </div>

                {/* 추천 포뮬라 (recommended_formula) */}
                <div className="bg-[#ffffff] border border-[#e3e8ee] rounded-lg p-4">
                  <div className="text-xs font-semibold text-[#697386] uppercase tracking-wide mb-2"><FlaskConical size={14} className="inline" /> 추천 포뮬라</div>
                  {intel.products && intel.products.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {intel.products.map((p: string, i: number) => (
                        <span key={i} className="text-xs bg-[#e3e8ee] text-[#1a1f36] px-2 py-1 rounded">
                          {p}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-[#8792a2]">정보 없음</p>
                  )}
                </div>

                {/* 제안 앵글 (proposal_angle) */}
                <div className="bg-[#ffffff] border border-[#e3e8ee] rounded-lg p-4">
                  <div className="text-xs font-semibold text-[#697386] uppercase tracking-wide mb-2"><Target size={14} className="inline text-[#635BFF]" /> 제안 앵글</div>
                  <p className="text-xs text-[#1a1f36] leading-relaxed whitespace-pre-wrap">
                    {intel.tier_note || '정보 없음'}
                  </p>
                </div>

                {/* "이 인텔로 이메일 생성" 버튼 (#6) */}
                <div className="pt-2">
                  <button
                    onClick={handleGenerateKo}
                    disabled={generatingKo || contacts.length === 0 || draftKo !== null}
                    className="w-full text-xs bg-[#635BFF] text-white py-2.5 rounded-lg font-semibold hover:bg-[#5851DB] disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    {generatingKo ? '국문 초안 생성 중...' : draftKo ? '국문 초안 생성됨 ↓' : <><MailOpen size={14} className="inline" /> 이 인텔로 이메일 생성</>}
                  </button>
                  {contacts.length === 0 && (
                    <div className="text-xs text-[#f59e0b] mt-2 text-center">담당자 정보가 먼저 필요합니다</div>
                  )}
                </div>

                {/* 국문 초안 확인 화면 */}
                {draftKo && (
                  <div className="bg-[#f6f8fa] border border-[#635BFF]/40 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold text-[#7A73FF]"><FileText size={14} className="inline" /> 국문 초안 확인</div>
                      {draftSaved && (
                        <span className="text-xs bg-[#22c55e]/20 text-[#22c55e] px-2 py-0.5 rounded"><Check size={14} className="inline" /> 영문 저장 완료</span>
                      )}
                    </div>
                    <div>
                      <div className="text-xs text-[#8792a2] mb-1">제목</div>
                      <div className="text-xs text-[#1a1f36] bg-[#ffffff] border border-[#e3e8ee] rounded px-3 py-2">{draftKo.subject}</div>
                    </div>
                    <div>
                      <div className="text-xs text-[#8792a2] mb-1">본문</div>
                      <div className="text-xs text-[#1a1f36] bg-[#ffffff] border border-[#e3e8ee] rounded px-3 py-2 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
                        {draftKo.body}
                      </div>
                    </div>
                    {!draftSaved && (
                      <button
                        onClick={handleTranslateSave}
                        disabled={translating}
                        className="w-full text-xs bg-[#22c55e] text-white py-2 rounded font-semibold hover:bg-[#16a34a] disabled:opacity-50 transition"
                      >
                        {translating ? '영문 번역 중...' : '영문에 반영 (email_drafts 저장)'}
                      </button>
                    )}
                  </div>
                )}

                {draftError && (
                  <div className="bg-[#ef4444]/10 border border-[#ef4444]/40 rounded-lg p-3">
                    <div className="text-xs text-[#fca5a5]">오류: {draftError}</div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="text-xs text-[#8792a2]">아직 분석 데이터가 없습니다.</div>
                <div className="text-xs text-[#8792a2] mt-1">파이프라인을 실행해주세요.</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
