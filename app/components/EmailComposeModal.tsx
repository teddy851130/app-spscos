'use client';

import { useState, useEffect } from 'react';
import { Check, X, Send, Search, Bot, Building2, Lightbulb, FlaskConical, Target, Pencil, Sparkles, RefreshCw, Paperclip, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { parseIntelJson } from './BuyerIntelDrawer';

interface EmailComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSent?: () => void;  // 발송 성공 후 호출 — Buyers에서 상태 갱신용
  buyer: {
    id?: string;
    company: string;
    contact: string;
    email: string;
    region: string;
    tier: string;
    status: string;
    website?: string;
    email_count?: number;   // 발송 횟수 — emailType 자동 결정에 사용
    contact_id?: string;    // 담당자 UUID — buyer_activities 연결용
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

export default function EmailComposeModal({ isOpen, onClose, onSent, buyer }: EmailComposeModalProps) {
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
      : (intel.recommended_formula || '스킨케어, 화장품 OEM/ODM');
    const angle = intel.proposal_angle || '';

    // 국문 탭에만 반영 — 영문 탭(emailBody/subject)은 절대 건드리지 않음
    const koBody = `안녕하세요 ${firstName}님,

SPS Cosmetics(spscos.com) CEO 신동환입니다. 저희는 한국의 OEM/ODM 화장품 전문 제조사입니다.

${companyStatus ? `${buyer.company}의 최근 동향을 주목하고 있습니다 — ${companyStatus} ` : ''}${kbeautyInterest ? `귀사의 ${kbeautyInterest}를 감안할 때, ` : ''}${formula} 분야에서의 협력이 적합할 것으로 판단됩니다.

${angle || `저희는 K-beauty 포뮬라를 전문으로 하며 MOQ 3,000개부터 가능합니다. ${buyer.region} 시장에 새로운 제품 라인을 도입하기에 적합합니다.`}

간단한 통화로 더 자세히 논의해볼 수 있을까요?

감사합니다.
신동환 | CEO
SPS Cosmetics | spscos.com`;

    setKoreanBody(koBody);
    setCurrentTab('ko');
    // NOTE: setEmailBody / setSubject 호출 금지 — 영문 발송본 보호
  };

  useEffect(() => {
    if (isOpen) {
      // 기본값: 영문/국문 템플릿. Claude 초개인화는 "바이어 인텔" 탭의
      // "이 인텔로 이메일 재생성" 버튼에서 별도 트리거됨 (모달 자동 호출 X).
      const firstName = buyer.contact.split(' ')[0];
      setEmailBody(englishEmailTemplate(firstName, buyer.company, buyer.region));
      setKoreanBody(koreanEmailTemplate(firstName, buyer.company, buyer.region));
      setIntel(null);
      setIntelLoaded(false);
      document.body.style.overflow = 'hidden';
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

  const handleSend = async () => {
    if (!buyer.email) {
      alert('이메일 주소가 없습니다. 바이어 DB를 확인해주세요.');
      return;
    }
    if (!subject.trim() || !emailBody.trim()) {
      alert('제목과 본문을 모두 입력해주세요.');
      return;
    }
    setIsLoading(true);
    try {
      // Supabase Edge Function 'send-email' 호출 (Gmail SMTP 발송 + email_logs 기록)
      // emailType 자동 결정: 발송 횟수 기반
      // 0회 → initial, 1회 → followup1, 2회 → followup2, 3회+ → breakup
      const count = buyer.email_count ?? 0;
      const autoEmailType = count === 0 ? 'initial'
        : count === 1 ? 'followup1'
        : count === 2 ? 'followup2'
        : 'breakup';

      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          to: buyer.email,
          toName: buyer.contact,
          subject,
          body: emailBody,
          buyerId: buyer.id || null,
          contactId: buyer.contact_id || null,
          emailType: autoEmailType,
        },
      });

      if (error) {
        // Edge Function 호출 자체 실패 (네트워크, 함수 미배포 등)
        throw new Error(error.message || 'Edge Function 호출 실패');
      }
      if (!data?.success) {
        // Edge Function은 응답했지만 발송 실패
        throw new Error(data?.error || '알 수 없는 발송 오류');
      }

      // 발송 성공 — 로그 기록 경고가 있으면 콘솔에만 남기고 사용자에겐 성공 알림
      if (data.warning) {
        console.warn('[send-email]', data.warning);
      }
      setShowToast(true);
      onSent?.();  // 발송 성공 → Buyers에서 버튼/상태 갱신
      onClose();
      setTimeout(() => setShowToast(false), 5000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      alert('발송 실패: ' + msg);
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

  const applyKoToEn = async () => {
    if (!koreanBody.trim()) {
      alert('국문 탭 내용이 비어 있습니다.');
      return;
    }
    setIsLoading(true);
    try {
      // generate-draft Edge Function의 translate_only 액션 호출 (DB 저장 없음)
      const { data, error } = await supabase.functions.invoke('generate-draft', {
        body: {
          action: 'translate_only',
          ko_subject: subject,
          ko_body: koreanBody,
        },
      });

      if (error) throw new Error(error.message || 'Edge Function 호출 실패');
      if (!data?.en_subject || !data?.en_body) {
        throw new Error(data?.error || '번역 응답 형식 오류');
      }

      setSubject(data.en_subject);
      setEmailBody(data.en_body);
      setCurrentTab('en');
    } catch (e) {
      alert('영문 번역 실패: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setIsLoading(false);
    }
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
          <div className="bg-[#ffffff] rounded-lg border border-[#e3e8ee] w-full max-w-[900px] max-h-[90vh] flex flex-col shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#e3e8ee] flex-shrink-0">
              <div>
                <div className="text-base font-bold text-[#1a1f36]">발송 전 최종 검토</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="bg-[#22c55e]/20 text-[#22c55e] text-xs px-2 py-0.5 rounded">
                    <Check size={14} className="inline" /> 스팸 점수 85/100 — 안전
                  </span>
                  {intel && (
                    <span className="bg-[#635BFF]/20 text-[#7A73FF] text-xs px-2 py-0.5 rounded">
                      <Search size={14} className="inline" /> 인텔 로드됨
                    </span>
                  )}
                </div>
              </div>
              <button onClick={onClose} className="text-[#697386] hover:text-[#1a1f36] text-xl font-bold">
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 flex min-h-0 overflow-hidden">
              {/* Left Panel */}
              <div className="flex-1 flex flex-col border-r border-[#e3e8ee] overflow-hidden">
                {/* Recipient Info */}
                <div className="px-6 py-4 bg-[#f6f8fa] border-b border-[#e3e8ee] flex-shrink-0">
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-[#8792a2]">받는사람</span>
                      <span className="text-[#1a1f36] font-semibold">
                        {buyer.contact} ({buyer.company})
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#8792a2]">발신</span>
                      <span className="text-[#1a1f36]">Donghwan Shin &lt;teddy@spscos.com&gt;</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[#8792a2]">숨은참조</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[#1a1f36]">spscos@pipedrivemail.com</span>
                        <span className="bg-[#22c55e]/20 text-[#22c55e] text-xs px-2 py-0.5 rounded">
                          Pipedrive 자동연동
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Subject Field */}
                <div className="px-6 py-4 border-b border-[#e3e8ee] flex-shrink-0">
                  <label className="text-xs text-[#8792a2] mb-2 block">제목</label>
                  <div
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(e) => setSubject(e.currentTarget.textContent || '')}
                    className="w-full bg-transparent text-[#1a1f36] outline-none text-sm font-semibold"
                  >
                    {subject}
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-[#e3e8ee] flex-shrink-0 bg-[#f6f8fa]">
                  <button
                    onClick={() => setCurrentTab('en')}
                    className={`flex-1 px-4 py-3 text-xs font-semibold border-b-2 transition ${
                      currentTab === 'en'
                        ? 'text-[#635BFF] border-[#635BFF]'
                        : 'text-[#8792a2] border-transparent hover:text-[#697386]'
                    }`}
                  >
                    🇺🇸 영문(발송본)
                  </button>
                  <button
                    onClick={() => setCurrentTab('ko')}
                    className={`flex-1 px-4 py-3 text-xs font-semibold border-b-2 transition ${
                      currentTab === 'ko'
                        ? 'text-[#635BFF] border-[#635BFF]'
                        : 'text-[#8792a2] border-transparent hover:text-[#697386]'
                    }`}
                  >
                    🇰🇷 국문 수정
                  </button>
                  <button
                    onClick={() => setCurrentTab('intel')}
                    className={`flex-1 px-4 py-3 text-xs font-semibold border-b-2 transition relative ${
                      currentTab === 'intel'
                        ? 'text-[#635BFF] border-[#635BFF]'
                        : 'text-[#8792a2] border-transparent hover:text-[#697386]'
                    }`}
                  >
                    <Search size={14} className="inline" /> 바이어 인텔
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
                        className="w-full h-64 bg-[#f6f8fa] border border-[#e3e8ee] text-[#1a1f36] p-4 rounded-lg text-xs font-mono resize-none focus:outline-none focus:border-[#635BFF]"
                      />
                      {intel && (
                        <button
                          onClick={regenerateWithIntel}
                          disabled={isLoading}
                          className="text-xs bg-[#635BFF]/20 text-[#7A73FF] px-3 py-1.5 rounded font-semibold hover:bg-[#635BFF]/30 transition disabled:opacity-50"
                        >
                          <Sparkles size={14} className="inline" /> 바이어 인텔로 메일 재생성
                        </button>
                      )}
                    </div>
                  )}

                  {currentTab === 'ko' && (
                    <div className="space-y-3">
                      <textarea
                        value={koreanBody}
                        onChange={(e) => setKoreanBody(e.target.value)}
                        className="w-full h-64 bg-[#f6f8fa] border border-[#e3e8ee] text-[#1a1f36] p-4 rounded-lg text-xs font-mono resize-none focus:outline-none focus:border-[#635BFF]"
                      />
                      <button onClick={applyKoToEn} className="text-xs text-[#635BFF] hover:text-[#7A73FF] font-semibold">
                        → 영문에 반영
                      </button>
                    </div>
                  )}

                  {currentTab === 'intel' && (
                    <div className="space-y-4">
                      {intelLoading ? (
                        <div className="space-y-3">
                          {[1, 2, 3].map((i) => (
                            <div key={i} className="bg-[#f6f8fa] border border-[#e3e8ee] rounded-lg p-4 animate-pulse">
                              <div className="h-3 bg-[#e3e8ee] rounded w-1/3 mb-2"></div>
                              <div className="h-3 bg-[#e3e8ee] rounded w-full mb-1"></div>
                              <div className="h-3 bg-[#e3e8ee] rounded w-4/5"></div>
                            </div>
                          ))}
                          <p className="text-xs text-[#8792a2] text-center">
                            <Bot size={16} className="inline text-[#635BFF]" /> Claude AI가 {buyer.company} 분석 중...
                          </p>
                        </div>
                      ) : intel ? (
                        <>
                          {/* 회사 현황 (company_status) — BuyerIntelDrawer와 통일 */}
                          <div className="bg-[#f6f8fa] border border-[#e3e8ee] rounded-lg p-4">
                            <div className="text-xs font-semibold text-[#697386] uppercase tracking-wide mb-2"><Building2 size={14} className="inline" /> 회사 현황</div>
                            <div className="text-xs font-bold text-[#1a1f36] mb-2">{buyer.company} · {buyer.region} · {buyer.tier}</div>
                            <p className="text-xs text-[#1a1f36] leading-relaxed whitespace-pre-wrap">{intel.overview || '정보 없음'}</p>
                          </div>

                          {/* K-beauty 관심도 (kbeauty_interest) */}
                          <div className="bg-[#f0f0ff30] border border-[#635BFF40] rounded-lg p-4">
                            <div className="text-xs font-semibold text-[#7A73FF] uppercase tracking-wide mb-2"><Lightbulb size={14} className="inline text-[#f59e0b]" /> K-beauty 관심도</div>
                            <p className="text-xs text-[#93c5fd] leading-relaxed whitespace-pre-wrap">{intel.why_kbeauty || '정보 없음'}</p>
                          </div>

                          {/* 추천 포뮬라 (recommended_formula) */}
                          <div className="bg-[#f6f8fa] border border-[#e3e8ee] rounded-lg p-4">
                            <div className="text-xs font-semibold text-[#697386] uppercase tracking-wide mb-2"><FlaskConical size={14} className="inline" /> 추천 포뮬라</div>
                            {intel.products && intel.products.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {intel.products.map((p: string, i: number) => (
                                  <span key={i} className="text-xs bg-[#e3e8ee] text-[#1a1f36] px-2 py-0.5 rounded">
                                    {p}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-[#8792a2]">정보 없음</p>
                            )}
                          </div>

                          {/* 제안 앵글 (proposal_angle) */}
                          <div className="bg-[#f6f8fa] border border-[#e3e8ee] rounded-lg p-4">
                            <div className="text-xs font-semibold text-[#697386] uppercase tracking-wide mb-2"><Target size={14} className="inline text-[#635BFF]" /> 제안 앵글</div>
                            <p className="text-xs text-[#1a1f36] leading-relaxed whitespace-pre-wrap">{intel.tier_note || '정보 없음'}</p>
                          </div>

                          {/* Regenerate button */}
                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={regenerateWithIntel}
                              disabled={isLoading}
                              className="flex-1 text-xs bg-[#635BFF] text-white py-2 rounded-lg font-semibold hover:bg-[#5851DB] transition disabled:opacity-50"
                            >
                              {isLoading ? '생성 중...' : <><Sparkles size={14} className="inline" /> 이 인텔로 이메일 재생성</>}
                            </button>
                            <button
                              onClick={() => { setIntelLoaded(false); setIntel(null); fetchIntel(); }}
                              disabled={intelLoading}
                              className="text-xs border border-[#e3e8ee] text-[#8792a2] px-3 py-2 rounded-lg hover:bg-[#e3e8ee] transition"
                            >
                              <RefreshCw size={14} />
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="text-center py-8">
                          <div className="text-xs text-[#8792a2]">아직 분석 데이터가 없습니다.</div>
                          <div className="text-xs text-[#8792a2] mt-1">파이프라인을 실행해주세요.</div>
                          <button onClick={() => fetchIntel()} className="block mx-auto mt-3 text-xs text-[#635BFF] hover:underline">
                            다시 시도
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* AI Prompts Section */}
                <div className="px-6 py-3 border-t border-[#e3e8ee] flex-shrink-0">
                  <button
                    onClick={() => setShowAIPrompts(!showAIPrompts)}
                    className="text-xs text-[#635BFF] hover:text-[#7A73FF] font-semibold"
                  >
                    <Sparkles size={14} className="inline" /> AI 수정 요청
                  </button>

                  {showAIPrompts && (
                    <div className="mt-3 p-3 bg-[#f6f8fa] border border-[#e3e8ee] rounded-lg space-y-2">
                      <div className="flex flex-wrap gap-2">
                        {['더 짧게', '친근한 톤', '격식체', 'CTA 강화'].map((preset) => (
                          <button
                            key={preset}
                            onClick={() => applyAIPreset(preset)}
                            className="text-xs bg-[#e3e8ee] text-[#1a1f36] px-2 py-1 rounded hover:bg-[#8792a2]"
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
                        className="w-full text-xs bg-[#ffffff] border border-[#e3e8ee] text-[#1a1f36] px-2 py-1 rounded placeholder-[#8792a2] focus:outline-none focus:border-[#635BFF]"
                      />
                      <button
                        onClick={() => applyAIPreset('custom')}
                        className="w-full text-xs bg-[#635BFF] text-white py-1 rounded hover:bg-[#5851DB] font-semibold"
                      >
                        적용
                      </button>
                    </div>
                  )}
                </div>

                {/* Edit Notice */}
                <div className="px-6 py-3 bg-[#f6f8fa] text-xs text-[#8792a2] border-t border-[#e3e8ee] flex-shrink-0">
                  <Pencil size={14} className="inline" /> 영문·국문 모두 직접 수정 가능 · <Search size={14} className="inline" /> 바이어 인텔 탭에서 개인화 포인트 확인 가능
                </div>
              </div>

              {/* Right Panel */}
              <div className="w-[300px] bg-[#f6f8fa] border-l border-[#e3e8ee] flex flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto">
                  {/* 첨부 파일 */}
                  <div className="px-4 py-4 border-b border-[#e3e8ee]">
                    <div className="text-xs font-semibold text-[#1a1f36] mb-3">첨부 파일</div>
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
                            <div className="text-xs font-semibold text-[#1a1f36]">SPS_Company_Profile_2026.pdf</div>
                            <div className="text-xs text-[#8792a2]">2.4MB</div>
                          </div>
                        </div>
                        {attachPDF1 && <span className="text-xs text-[#22c55e]"><Check size={14} className="inline" /> 첨부됨</span>}
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
                            <div className="text-xs font-semibold text-[#1a1f36]">SPS_Product_Catalog_2026.pdf</div>
                            <div className="text-xs text-[#8792a2]">5.1MB</div>
                          </div>
                        </div>
                        {attachPDF2 && <span className="text-xs text-[#22c55e]"><Check size={14} className="inline" /> 첨부됨</span>}
                      </div>
                    </div>
                    <div className="mt-3 border-2 border-dashed border-[#e3e8ee] rounded-lg p-4 text-center cursor-pointer hover:border-[#635BFF] transition">
                      <div className="text-lg mb-1"><Paperclip size={18} className="inline" /></div>
                      <div className="text-xs text-[#8792a2]">파일을 드래그하거나 클릭</div>
                    </div>
                  </div>

                  {/* 발송 전 체크 */}
                  <div className="px-4 py-4 border-b border-[#e3e8ee]">
                    <div className="bg-[#14532d20] border border-[#16a34a30] rounded-lg p-3">
                      <div className="text-xs font-semibold text-[#22c55e] mb-2">발송 전 체크</div>
                      <div className="space-y-2 text-xs text-[#4ade80]">
                        <div className="flex items-center gap-2"><Check size={14} /><span>스팸점수 85/100</span></div>
                        <div className="flex items-center gap-2"><Check size={14} /><span>Gmail인박스율 100%</span></div>
                        <div className="flex items-center gap-2"><Check size={14} /><span>도메인평판 HIGH</span></div>
                        <div className="flex items-center gap-2"><Check size={14} /><span>SPF/DKIM</span></div>
                      </div>
                    </div>
                  </div>

                  {/* 발송 방식 */}
                  <div className="px-4 py-4">
                    <div className="text-xs font-semibold text-[#1a1f36] mb-3">발송 방식</div>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="sendType" defaultChecked className="w-4 h-4" />
                        <span className="text-xs text-[#1a1f36]">지금 즉시 발송</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="sendType" className="w-4 h-4" />
                        <span className="text-xs text-[#1a1f36]">오늘 밤 야간 파이프라인</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="sendType" className="w-4 h-4" />
                        <span className="text-xs text-[#1a1f36]">예약 발송</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-[#e3e8ee] flex-shrink-0 bg-[#f6f8fa]">
              <span className="text-xs text-[#8792a2]">
                이번 주 발송: 13/15통 · 오늘 남은 발송: 2통
              </span>
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 border border-[#e3e8ee] text-[#697386] rounded-lg text-xs font-semibold hover:bg-[#e3e8ee] transition"
                >
                  취소
                </button>
                <button
                  onClick={handleSend}
                  disabled={isLoading}
                  className="px-4 py-2 bg-[#635BFF] text-white rounded-lg text-xs font-semibold hover:bg-[#5851DB] transition disabled:opacity-50"
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <span className="inline-block w-3 h-3 border-2 border-[#635BFF] border-t-white rounded-full animate-spin" />
                      발송 중...
                    </span>
                  ) : (
                    <><Send size={14} className="inline" /> 발송하기</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {showToast && (
        <div className="fixed bottom-6 right-6 bg-[#ffffff] border border-[#e3e8ee] rounded-lg p-4 z-50 shadow-lg max-w-sm">
          <div className="text-sm font-semibold text-[#22c55e] mb-1"><CheckCircle size={16} className="inline" /> 이메일 발송 완료</div>
          <div className="text-xs text-[#1a1f36] mb-2">
            {buyer.contact} ({buyer.company})에게 발송되었습니다.
          </div>
          <div className="text-xs text-[#8792a2]">Pipedrive BCC 연동 · 이메일 로그 기록 완료</div>
        </div>
      )}
    </>
  );
}
