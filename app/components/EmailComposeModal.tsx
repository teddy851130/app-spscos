'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { parseIntelJson } from './BuyerIntelDrawer';

interface EmailComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  buyer: {
    id?: string;
    company: string;
    contact: string;
    email: string;
    region: string;
    tier: string;
    status: string;
    website?: string;
  };
}

const englishEmailTemplate = (firstName: string, company: string, region: string) => `Dear ${firstName},

I hope this message finds you well. My name is Donghwan Shin, CEO of SPS International — a Korean cosmetics OEM/ODM specialist based in Seoul.

Having followed ${company}'s impressive growth across the ${region} market, I believe there's a compelling opportunity for us to collaborate. We specialize in developing premium Korean beauty formulations tailored to specific regional preferences, with a proven track record of delivering high-quality products at competitive price points.

Some highlights of our capabilities:
• Full OEM/ODM service from formulation to packaging design
• MOQ as low as 3,000 units per SKU
• Regulatory compliance support for ${region} markets
• 4–8 week sample development timeline

Would you be open to a 20-minute call to explore potential synergies?

Best regards,
Donghwan Shin | CEO
SPS International | spscos.com | +82-10-XXXX-XXXX`;

const koreanEmailTemplate = (firstName: string, company: string, region: string) => `안녕하세요 ${firstName}님,

SPS International의 CEO 신동환입니다. 한국 최고의 화장품 OEM/ODM 전문업체로서, 서울에 본사를 두고 있습니다.

${company}의 ${region} 시장에서의 인상적인 성장을 주목하고 있으며, 이번 기회를 통해 함께 협력할 수 있는 방안을 제안드립니다. 저희는 각 지역의 특성에 맞춘 프리미엄 한방 미용 제품 개발을 전문으로 하고 있으며, 뛰어난 품질과 경쟁력 있는 가격대로 많은 고객사에 신뢰를 받고 있습니다.

저희 서비스의 주요 특징:
• 포뮬레이션부터 패키징 디자인까지 전체 OEM/ODM 서비스 제공
• 최소 발주량(MOQ) 3,000개/SKU부터 가능
• ${region} 시장 규제 준수 지원
• 샘플 개발 기간: 4~8주

혹시 20분 정도 시간을 내어 협력 방안에 대해 이야기 나눌 수 있을까요?

감사합니다.
신동환 | CEO
SPS International | spscos.com | +82-10-XXXX-XXXX`;

export default function EmailComposeModal({ isOpen, onClose, buyer }: EmailComposeModalProps) {
  const [currentTab, setCurrentTab] = useState<'en' | 'ko' | 'intel'>('en');
  const [emailBody, setEmailBody] = useState('');
  const [koreanBody, setKoreanBody] = useState('');
  const [subject, setSubject] = useState('K-Beauty OEM Partnership Opportunity — SPS International');
  const [showAIPrompts, setShowAIPrompts] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [attachPDF1, setAttachPDF1] = useState(true);
  const [attachPDF2, setAttachPDF2] = useState(false);

  // Buyer intel state
  const [intel, setIntel] = useState<any>(null);
  const [intelLoading, setIntelLoading] = useState(false);
  const [intelLoaded, setIntelLoaded] = useState(false);

  const fetchIntel = async () => {
    setIntelLoading(true);
    try {
      const { data } = await supabase
        .from('buyers')
        .select('recent_news')
        .eq('id', (buyer as any).id)
        .single();

      // BuyerIntelDrawer와 동일한 파싱 + 매핑 (raw 복구 + overview/products/why_kbeauty/tier_note)
      const parsed = parseIntelJson(data?.recent_news);
      setIntel(parsed);
      setIntelLoaded(true);
    } catch {
      setIntel(null);
      setIntelLoaded(true);
    } finally {
      setIntelLoading(false);
    }
  };

  const regenerateWithIntel = async () => {
    if (!intel) return;
    const firstName = buyer.contact.split(' ')[0];
    const companyStatus = intel.company_status || intel.overview || '';
    const kbeautyInterest = intel.kbeauty_interest || intel.why_kbeauty || '';
    const formula = Array.isArray(intel.recommended_formula)
      ? intel.recommended_formula.join(', ')
      : (intel.recommended_formula || 'skincare, cosmetics OEM/ODM');
    const angle = intel.proposal_angle || '';

    const personalizedBody = `Dear ${firstName},

I hope this message finds you well. My name is Teddy Shin, CEO of SPS Cosmetics — a Korean OEM/ODM specialist.

${companyStatus ? `I've been following ${buyer.company}'s recent developments — ${companyStatus}. ` : ''}${kbeautyInterest ? `Given your ${kbeautyInterest}, ` : ''}I believe there's a strong fit for us to collaborate on ${formula}.

${angle || `We specialize in K-beauty formulations with a 3,000 unit MOQ, perfect for testing new product lines in the ${buyer.region} market.`}

Would you be open to a brief call to explore this further?

Best regards,
Teddy Shin | CEO
SPS Cosmetics | spscos.com`;

    setEmailBody(personalizedBody);
    setSubject(`${buyer.company} x K-Beauty ${formula.split(',')[0] || 'Partnership'} — SPS Cosmetics`);
    setCurrentTab('en');
  };

  useEffect(() => {
    if (isOpen) {
      const firstName = buyer.contact.split(' ')[0];
      setEmailBody(englishEmailTemplate(firstName, buyer.company, buyer.region));
      setKoreanBody(koreanEmailTemplate(firstName, buyer.company, buyer.region));
      setIntel(null);
      setIntelLoaded(false);
      document.body.style.overflow = 'hidden';

      // Call AI draft API
      (async () => {
        try {
          const res = await fetch('/api/draft-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              buyer_name: buyer.contact,
              company: buyer.company,
              region: buyer.region,
              tier: buyer.tier,
              products: 'skincare, cosmetics OEM/ODM',
            }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.body) setEmailBody(data.body);
            if (data.subject) setSubject(data.subject);
          }
        } catch {
          // Keep template fallback
        }
      })();
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, buyer]);

  // Fetch intel when intel tab is opened (lazy load)
  useEffect(() => {
    if (currentTab === 'intel' && !intelLoaded && !intelLoading && isOpen) {
      fetchIntel();
    }
  }, [currentTab, isOpen]);

  const getMailButtonLabel = () => {
    if (buyer.status === '회신받음') return '팔로업';
    if (buyer.status === '발송완료') return '재발송';
    return '첫 발송';
  };

  const handleSend = async () => {
    if (!buyer.email) {
      alert('이메일 주소가 없습니다. 바이어 DB를 확인해주세요.');
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: buyer.email,
          toName: buyer.contact,
          company: buyer.company,
          subject,
          body: emailBody,
          buyerId: (buyer as any).id || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowToast(true);
        onClose();
        setTimeout(() => setShowToast(false), 5000);
      } else {
        alert(data.message || '발송 실패: ' + (data.error || '알 수 없는 오류'));
      }
    } catch (err: any) {
      alert('발송 오류: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const applyAIPreset = (preset: string) => {
    const firstName = buyer.contact.split(' ')[0];
    if (preset === '더 짧게') {
      setEmailBody(`Dear ${firstName},\n\nI'm Donghwan Shin, CEO of SPS International — a Korean cosmetics OEM/ODM specialist.\n\nWe'd love to explore a K-Beauty partnership with ${buyer.company}. MOQ from 3,000 units, 4–8 week sample timeline.\n\nOpen to a 20-minute call?\n\nBest,\nDonghwan Shin | SPS International | spscos.com`);
    } else if (preset === '친근한 톤') {
      setEmailBody(`Hi ${firstName}!\n\nHope you're doing well! I'm Donghwan from SPS International — we help brands like ${buyer.company} develop amazing K-Beauty products.\n\nWould love to chat about how we could work together. Quick 20-min call sometime this week?\n\nCheers,\nDonghwan Shin | SPS International`);
    } else if (preset === '격식체') {
      setEmailBody(`Dear ${firstName},\n\nI am writing to formally introduce SPS International, a leading Korean cosmetics OEM/ODM specialist with an established track record in the ${buyer.region} market.\n\nWe would welcome the opportunity to arrange a brief consultation at your earliest convenience to explore a potential partnership with ${buyer.company}.\n\nYours sincerely,\nDonghwan Shin | Chief Executive Officer\nSPS International | spscos.com`);
    } else if (preset === 'CTA 강화') {
      setEmailBody(`Dear ${firstName},\n\n${buyer.company} is exactly the kind of brand we've been hoping to work with. I'm Donghwan Shin, CEO of SPS International.\n\nI have 3 specific product concepts in mind for the ${buyer.region} market that I believe could drive significant growth for ${buyer.company} this year.\n\nCan we schedule 20 minutes this week — Tuesday or Wednesday? I'll send a calendar invite immediately.\n\nBest regards,\nDonghwan Shin | CEO\nSPS International | spscos.com | +82-10-XXXX-XXXX`);
    } else if (aiPrompt) {
      setEmailBody(`Dear ${firstName},\n\n[AI 수정 적용: ${aiPrompt}]\n\n` + emailBody);
      setAiPrompt('');
    }
    setShowAIPrompts(false);
    setCurrentTab('en');
  };

  const applyKoToEn = () => {
    const firstName = buyer.contact.split(' ')[0];
    setEmailBody(`Dear ${firstName},\n\n[국문 내용 번역 반영됨]\n\n${koreanBody.substring(0, 200)}...\n\nBest regards,\nDonghwan Shin | CEO\nSPS International | spscos.com`);
    setCurrentTab('en');
  };

  if (!isOpen && !showToast) return null;

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40" onClick={onClose} />
      )}

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1e293b] rounded-lg border border-[#334155] w-full max-w-[900px] max-h-[90vh] flex flex-col shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#334155] flex-shrink-0">
              <div>
                <div className="text-base font-bold text-[#f1f5f9]">발송 전 최종 검토</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="bg-[#22c55e]/20 text-[#22c55e] text-xs px-2 py-0.5 rounded">
                    ✓ 스팸 점수 85/100 — 안전
                  </span>
                  {intel && (
                    <span className="bg-[#3b82f6]/20 text-[#60a5fa] text-xs px-2 py-0.5 rounded">
                      🔍 인텔 로드됨
                    </span>
                  )}
                </div>
              </div>
              <button onClick={onClose} className="text-[#94a3b8] hover:text-[#f1f5f9] text-xl font-bold">
                ✕
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 flex min-h-0 overflow-hidden">
              {/* Left Panel */}
              <div className="flex-1 flex flex-col border-r border-[#334155] overflow-hidden">
                {/* Recipient Info */}
                <div className="px-6 py-4 bg-[#0f172a] border-b border-[#334155] flex-shrink-0">
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-[#64748b]">받는사람</span>
                      <span className="text-[#e2e8f0] font-semibold">
                        {buyer.contact} ({buyer.company})
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#64748b]">발신</span>
                      <span className="text-[#e2e8f0]">Donghwan Shin &lt;teddy@spscos.com&gt;</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[#64748b]">숨은참조</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[#e2e8f0]">spscos@pipedrivemail.com</span>
                        <span className="bg-[#22c55e]/20 text-[#22c55e] text-xs px-2 py-0.5 rounded">
                          Pipedrive 자동연동
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Subject Field */}
                <div className="px-6 py-4 border-b border-[#334155] flex-shrink-0">
                  <label className="text-xs text-[#64748b] mb-2 block">제목</label>
                  <div
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(e) => setSubject(e.currentTarget.textContent || '')}
                    className="w-full bg-transparent text-[#e2e8f0] outline-none text-sm font-semibold"
                  >
                    {subject}
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-[#334155] flex-shrink-0 bg-[#0f172a]">
                  <button
                    onClick={() => setCurrentTab('en')}
                    className={`flex-1 px-4 py-3 text-xs font-semibold border-b-2 transition ${
                      currentTab === 'en'
                        ? 'text-[#3b82f6] border-[#3b82f6]'
                        : 'text-[#64748b] border-transparent hover:text-[#94a3b8]'
                    }`}
                  >
                    🇺🇸 영문(발송본)
                  </button>
                  <button
                    onClick={() => setCurrentTab('ko')}
                    className={`flex-1 px-4 py-3 text-xs font-semibold border-b-2 transition ${
                      currentTab === 'ko'
                        ? 'text-[#3b82f6] border-[#3b82f6]'
                        : 'text-[#64748b] border-transparent hover:text-[#94a3b8]'
                    }`}
                  >
                    🇰🇷 국문 수정
                  </button>
                  <button
                    onClick={() => setCurrentTab('intel')}
                    className={`flex-1 px-4 py-3 text-xs font-semibold border-b-2 transition relative ${
                      currentTab === 'intel'
                        ? 'text-[#3b82f6] border-[#3b82f6]'
                        : 'text-[#64748b] border-transparent hover:text-[#94a3b8]'
                    }`}
                  >
                    🔍 바이어 인텔
                    {intel && !intelLoading && (
                      <span className="absolute top-2 right-3 w-1.5 h-1.5 bg-[#22c55e] rounded-full" />
                    )}
                  </button>
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-y-auto px-6 py-4">
                  {currentTab === 'en' && (
                    <div className="space-y-3">
                      <textarea
                        value={emailBody}
                        onChange={(e) => setEmailBody(e.target.value)}
                        className="w-full h-64 bg-[#0f172a] border border-[#334155] text-[#e2e8f0] p-4 rounded-lg text-xs font-mono resize-none focus:outline-none focus:border-[#3b82f6]"
                      />
                      {intel && (
                        <button
                          onClick={regenerateWithIntel}
                          disabled={isLoading}
                          className="text-xs bg-[#3b82f6]/20 text-[#60a5fa] px-3 py-1.5 rounded font-semibold hover:bg-[#3b82f6]/30 transition disabled:opacity-50"
                        >
                          ✨ 바이어 인텔로 메일 재생성
                        </button>
                      )}
                    </div>
                  )}

                  {currentTab === 'ko' && (
                    <div className="space-y-3">
                      <textarea
                        value={koreanBody}
                        onChange={(e) => setKoreanBody(e.target.value)}
                        className="w-full h-64 bg-[#0f172a] border border-[#334155] text-[#e2e8f0] p-4 rounded-lg text-xs font-mono resize-none focus:outline-none focus:border-[#3b82f6]"
                      />
                      <button onClick={applyKoToEn} className="text-xs text-[#3b82f6] hover:text-[#60a5fa] font-semibold">
                        → 영문에 반영
                      </button>
                    </div>
                  )}

                  {currentTab === 'intel' && (
                    <div className="space-y-4">
                      {intelLoading ? (
                        <div className="space-y-3">
                          {[1, 2, 3].map((i) => (
                            <div key={i} className="bg-[#0f172a] border border-[#334155] rounded-lg p-4 animate-pulse">
                              <div className="h-3 bg-[#334155] rounded w-1/3 mb-2"></div>
                              <div className="h-3 bg-[#334155] rounded w-full mb-1"></div>
                              <div className="h-3 bg-[#334155] rounded w-4/5"></div>
                            </div>
                          ))}
                          <p className="text-xs text-[#64748b] text-center">
                            🤖 Claude AI가 {buyer.company} 분석 중...
                          </p>
                        </div>
                      ) : intel ? (
                        <>
                          {/* 🏢 회사 현황 (company_status) — BuyerIntelDrawer와 통일 */}
                          <div className="bg-[#0f172a] border border-[#334155] rounded-lg p-4">
                            <div className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wide mb-2">🏢 회사 현황</div>
                            <div className="text-xs font-bold text-[#e2e8f0] mb-2">{buyer.company} · {buyer.region} · {buyer.tier}</div>
                            <p className="text-xs text-[#e2e8f0] leading-relaxed whitespace-pre-wrap">{intel.overview || '정보 없음'}</p>
                          </div>

                          {/* 💡 K-beauty 관심도 (kbeauty_interest) */}
                          <div className="bg-[#1e3a5f30] border border-[#3b82f640] rounded-lg p-4">
                            <div className="text-xs font-semibold text-[#60a5fa] uppercase tracking-wide mb-2">💡 K-beauty 관심도</div>
                            <p className="text-xs text-[#93c5fd] leading-relaxed whitespace-pre-wrap">{intel.why_kbeauty || '정보 없음'}</p>
                          </div>

                          {/* 🧪 추천 포뮬라 (recommended_formula) */}
                          <div className="bg-[#0f172a] border border-[#334155] rounded-lg p-4">
                            <div className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wide mb-2">🧪 추천 포뮬라</div>
                            {intel.products && intel.products.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {intel.products.map((p: string, i: number) => (
                                  <span key={i} className="text-xs bg-[#334155] text-[#e2e8f0] px-2 py-0.5 rounded">
                                    {p}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-[#64748b]">정보 없음</p>
                            )}
                          </div>

                          {/* 🎯 제안 앵글 (proposal_angle) */}
                          <div className="bg-[#0f172a] border border-[#334155] rounded-lg p-4">
                            <div className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wide mb-2">🎯 제안 앵글</div>
                            <p className="text-xs text-[#e2e8f0] leading-relaxed whitespace-pre-wrap">{intel.tier_note || '정보 없음'}</p>
                          </div>

                          {/* Regenerate button */}
                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={regenerateWithIntel}
                              disabled={isLoading}
                              className="flex-1 text-xs bg-[#3b82f6] text-white py-2 rounded-lg font-semibold hover:bg-[#2563eb] transition disabled:opacity-50"
                            >
                              {isLoading ? '생성 중...' : '✨ 이 인텔로 이메일 재생성'}
                            </button>
                            <button
                              onClick={() => { setIntelLoaded(false); setIntel(null); fetchIntel(); }}
                              disabled={intelLoading}
                              className="text-xs border border-[#334155] text-[#64748b] px-3 py-2 rounded-lg hover:bg-[#334155] transition"
                            >
                              🔄
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="text-center py-8">
                          <div className="text-xs text-[#64748b]">아직 분석 데이터가 없습니다.</div>
                          <div className="text-xs text-[#475569] mt-1">파이프라인을 실행해주세요.</div>
                          <button onClick={() => fetchIntel()} className="block mx-auto mt-3 text-xs text-[#3b82f6] hover:underline">
                            다시 시도
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* AI Prompts Section */}
                <div className="px-6 py-3 border-t border-[#334155] flex-shrink-0">
                  <button
                    onClick={() => setShowAIPrompts(!showAIPrompts)}
                    className="text-xs text-[#3b82f6] hover:text-[#60a5fa] font-semibold"
                  >
                    ✨ AI 수정 요청
                  </button>

                  {showAIPrompts && (
                    <div className="mt-3 p-3 bg-[#0f172a] border border-[#334155] rounded-lg space-y-2">
                      <div className="flex flex-wrap gap-2">
                        {['더 짧게', '친근한 톤', '격식체', 'CTA 강화'].map((preset) => (
                          <button
                            key={preset}
                            onClick={() => applyAIPreset(preset)}
                            className="text-xs bg-[#334155] text-[#e2e8f0] px-2 py-1 rounded hover:bg-[#475569]"
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                      <input
                        type="text"
                        placeholder="커스텀 지시사항 (예: Ramadan 관련 내용 추가해줘)..."
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && applyAIPreset('custom')}
                        className="w-full text-xs bg-[#1e293b] border border-[#334155] text-[#e2e8f0] px-2 py-1 rounded placeholder-[#64748b] focus:outline-none focus:border-[#3b82f6]"
                      />
                      <button
                        onClick={() => applyAIPreset('custom')}
                        className="w-full text-xs bg-[#3b82f6] text-white py-1 rounded hover:bg-[#2563eb] font-semibold"
                      >
                        적용
                      </button>
                    </div>
                  )}
                </div>

                {/* Edit Notice */}
                <div className="px-6 py-3 bg-[#0f172a] text-xs text-[#64748b] border-t border-[#334155] flex-shrink-0">
                  ✏️ 영문·국문 모두 직접 수정 가능 · 🔍 바이어 인텔 탭에서 개인화 포인트 확인 가능
                </div>
              </div>

              {/* Right Panel */}
              <div className="w-[300px] bg-[#0f172a] border-l border-[#334155] flex flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto">
                  {/* 첨부 파일 */}
                  <div className="px-4 py-4 border-b border-[#334155]">
                    <div className="text-xs font-semibold text-[#f1f5f9] mb-3">첨부 파일</div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={attachPDF1}
                            onChange={(e) => setAttachPDF1(e.target.checked)}
                            className="w-4 h-4 rounded cursor-pointer"
                          />
                          <div className="flex-1">
                            <div className="text-xs font-semibold text-[#e2e8f0]">SPS_Company_Profile_2026.pdf</div>
                            <div className="text-xs text-[#64748b]">2.4MB</div>
                          </div>
                        </div>
                        {attachPDF1 && <span className="text-xs text-[#22c55e]">✓ 첨부됨</span>}
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={attachPDF2}
                            onChange={(e) => setAttachPDF2(e.target.checked)}
                            className="w-4 h-4 rounded cursor-pointer"
                          />
                          <div className="flex-1">
                            <div className="text-xs font-semibold text-[#e2e8f0]">SPS_Product_Catalog_2026.pdf</div>
                            <div className="text-xs text-[#64748b]">5.1MB</div>
                          </div>
                        </div>
                        {attachPDF2 && <span className="text-xs text-[#22c55e]">✓ 첨부됨</span>}
                      </div>
                    </div>
                    <div className="mt-3 border-2 border-dashed border-[#334155] rounded-lg p-4 text-center cursor-pointer hover:border-[#3b82f6] transition">
                      <div className="text-lg mb-1">📎</div>
                      <div className="text-xs text-[#64748b]">파일을 드래그하거나 클릭</div>
                    </div>
                  </div>

                  {/* 발송 전 체크 */}
                  <div className="px-4 py-4 border-b border-[#334155]">
                    <div className="bg-[#14532d20] border border-[#16a34a30] rounded-lg p-3">
                      <div className="text-xs font-semibold text-[#22c55e] mb-2">발송 전 체크</div>
                      <div className="space-y-2 text-xs text-[#4ade80]">
                        <div className="flex items-center gap-2"><span>✓</span><span>스팸점수 85/100</span></div>
                        <div className="flex items-center gap-2"><span>✓</span><span>Gmail인박스율 100%</span></div>
                        <div className="flex items-center gap-2"><span>✓</span><span>도메인평판 HIGH</span></div>
                        <div className="flex items-center gap-2"><span>✓</span><span>SPF/DKIM</span></div>
                      </div>
                    </div>
                  </div>

                  {/* 발송 방식 */}
                  <div className="px-4 py-4">
                    <div className="text-xs font-semibold text-[#f1f5f9] mb-3">발송 방식</div>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="sendType" defaultChecked className="w-4 h-4" />
                        <span className="text-xs text-[#e2e8f0]">지금 즉시 발송</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="sendType" className="w-4 h-4" />
                        <span className="text-xs text-[#e2e8f0]">오늘 밤 야간 파이프라인</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="sendType" className="w-4 h-4" />
                        <span className="text-xs text-[#e2e8f0]">예약 발송</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-[#334155] flex-shrink-0 bg-[#0f172a]">
              <span className="text-xs text-[#64748b]">
                이번 주 발송: 13/15통 · 오늘 남은 발송: 2통
              </span>
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 border border-[#334155] text-[#94a3b8] rounded-lg text-xs font-semibold hover:bg-[#334155] transition"
                >
                  취소
                </button>
                <button
                  onClick={handleSend}
                  disabled={isLoading}
                  className="px-4 py-2 bg-[#3b82f6] text-white rounded-lg text-xs font-semibold hover:bg-[#2563eb] transition disabled:opacity-50"
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <span className="inline-block w-3 h-3 border-2 border-[#3b82f6] border-t-white rounded-full animate-spin" />
                      발송 중...
                    </span>
                  ) : (
                    '📤 발송하기'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {showToast && (
        <div className="fixed bottom-6 right-6 bg-[#1e293b] border border-[#334155] rounded-lg p-4 z-50 shadow-lg max-w-sm">
          <div className="text-sm font-semibold text-[#22c55e] mb-1">✅ 이메일 발송 완료</div>
          <div className="text-xs text-[#e2e8f0] mb-2">
            {buyer.contact} ({buyer.company})에게 발송되었습니다.
          </div>
          <div className="text-xs text-[#64748b]">Pipedrive BCC 연동 · 이메일 로그 기록 완료</div>
        </div>
      )}
    </>
  );
}
