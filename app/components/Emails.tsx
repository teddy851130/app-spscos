'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const emailsData = [
  {
    id: 1,
    to: 'maya@basharacare.com',
    company: 'Basharacare',
    subject: '한국 화장품 ODM 서비스 제안',
    status: 'replied',
    sent: '2026-04-02',
    opened: '2026-04-02',
    clicked: false,
    replied: '2026-04-04',
    region: 'GCC',
  },
  {
    id: 2,
    to: 'ahmad@namshi.com',
    company: 'Namshi',
    subject: '프리미엄 뷰티 브랜드 OEM 파트너십',
    status: 'opened',
    sent: '2026-04-03',
    opened: '2026-04-03',
    clicked: true,
    replied: null,
    region: 'GCC',
  },
  {
    id: 3,
    to: 'fatima@ounass.ae',
    company: 'Ounass',
    subject: 'SPS International - 샘플 개발 제안',
    status: 'replied',
    sent: '2026-04-01',
    opened: '2026-04-01',
    clicked: true,
    replied: '2026-04-03',
    region: 'GCC',
  },
  {
    id: 4,
    to: 'mohammed@noon.com',
    company: 'Noon Beauty',
    subject: '한국 최고 품질의 화장품 제조',
    status: 'replied',
    sent: '2026-03-31',
    opened: '2026-03-31',
    clicked: true,
    replied: '2026-04-02',
    region: 'GCC',
  },
  {
    id: 5,
    to: 'james@amazon.com',
    company: 'Amazon Beauty',
    subject: 'Korean Beauty ODM Solutions',
    status: 'opened',
    sent: '2026-04-02',
    opened: '2026-04-03',
    clicked: true,
    replied: null,
    region: 'USA',
  },
  {
    id: 6,
    to: 'sarah@sephora-usa.com',
    company: 'Sephora USA',
    subject: 'Exclusive ODM Partnership',
    status: 'sent',
    sent: '2026-04-04',
    opened: null,
    clicked: false,
    replied: null,
    region: 'USA',
  },
  {
    id: 7,
    to: 'emma@boots.co.uk',
    company: 'Boots Beauty',
    subject: 'Premium Korean Cosmetics Manufacturing',
    status: 'opened',
    sent: '2026-04-01',
    opened: '2026-04-02',
    clicked: false,
    replied: null,
    region: 'Europe',
  },
  {
    id: 8,
    to: 'layla@sephora-me.ae',
    company: 'Sephora Middle East',
    subject: 'SPS International Beauty Solutions',
    status: 'bounced',
    sent: '2026-04-01',
    opened: null,
    clicked: false,
    replied: null,
    region: 'GCC',
  },
];

const statusIcons: { [key: string]: { icon: string; bg: string; text: string; label: string } } = {
  sent: { icon: '✓', bg: 'bg-[#334155]/50', text: 'text-[#94a3b8]', label: '발송됨' },
  opened: { icon: '👁', bg: 'bg-[#60a5fa]/20', text: 'text-[#60a5fa]', label: '열람' },
  replied: { icon: '↩', bg: 'bg-[#22c55e]/20', text: 'text-[#22c55e]', label: '회신' },
  bounced: { icon: '✕', bg: 'bg-[#ef4444]/20', text: 'text-[#ef4444]', label: '반송' },
};

const emailTemplates = {
  initial: {
    'GCC-Tier1': {
      subject: 'Korean Beauty OEM Partnership — {company}',
      body_en: 'Dear {contact},\n\nI came across {company} and was impressed by your position in the GCC beauty market.\n\nI\'m Teddy Shin, CEO of SPS International. We help beauty retailers launch exclusive Korean-formulated products, starting from MOQ 3,000 units with 2-week sample turnaround.\n\nWould a quick 20-minute call make sense?\n\nBest,\nTeddy Shin\nCEO, SPS International\nteddy@spscos.com | www.spscos.com',
      body_ko: '안녕하세요,\n\n{company}의 GCC 시장 내 입지를 보고 연락드립니다.\n\nSPS International CEO 신동환입니다. MOQ 3,000개부터 한국 화장품 OEM/ODM 서비스를 제공합니다.\n\n20분 통화 가능하신가요?\n\n감사합니다,\n신동환',
    },
    'USA-Tier1': {
      subject: 'K-Beauty OEM Opportunity for {company}',
      body_en: 'Hi {contact},\n\nI noticed {company}\'s growing clean beauty focus and wanted to reach out.\n\nI\'m Teddy from SPS International — we connect US beauty brands with Korea\'s top OEM manufacturers. MOQ from 3,000 units, 2-week samples.\n\nOpen to a quick call?\n\nBest,\nTeddy Shin | teddy@spscos.com',
      body_ko: '안녕하세요,\n\n{company}의 클린뷰티 방향성에 관심이 있어 연락드립니다.\n\nSPS International 신동환입니다. MOQ 3,000개부터 한국 화장품 OEM/ODM을 지원합니다.',
    },
    'Europe-Tier1': {
      subject: 'Korean Beauty Formulas for {company} — EU Compliant',
      body_en: 'Dear {contact},\n\nI\'m reaching out regarding a K-Beauty OEM partnership opportunity for {company}.\n\nSPS International offers EU Cosmetics Regulation compliant formulas from Korea\'s top manufacturers, from MOQ 3,000 units.\n\nWould you be open to a brief call?\n\nKind regards,\nTeddy Shin | SPS International\nteddy@spscos.com',
      body_ko: '안녕하세요,\n\n{company}과의 K-뷰티 OEM 파트너십 관련 연락드립니다.',
    },
    'Tier2': {
      subject: 'Private Label K-Beauty for {company} — MOQ 3,000',
      body_en: 'Hi {contact},\n\nI\'d love to introduce SPS International to {company}. We help beauty brands launch Korean private-label products starting from 3,000 units.\n\nQuick call this week?\n\nBest,\nTeddy Shin | teddy@spscos.com',
      body_ko: '안녕하세요,\n\n{company}에 SPS International을 소개드리고 싶습니다.',
    },
  },
  followup1: {
    subject: 'Re: Korean Beauty OEM — {company}',
    body_en: 'Hi {contact},\n\nJust following up on my previous note. We recently helped a {region} retailer launch 3 exclusive K-Beauty SKUs in 6 weeks.\n\nWorth a quick chat?\n\nTeddy',
    body_ko: '안녕하세요,\n\n지난 메일 후속으로 연락드립니다. 최근 {region} 바이어가 6주 만에 3개 K-뷰티 SKU를 출시했어요.',
  },
  followup2: {
    subject: 'One more thing — K-Beauty Partnership',
    body_en: 'Hi {contact},\n\nI know you\'re busy, but wanted to check if {company} would be interested in exploring K-Beauty OEM. Happy to answer any questions.\n\nTeddy',
    body_ko: '안녕하세요,\n\n바쁘실 줄 알지만, {company}이 K-뷰티 OEM에 관심이 있으신지 확인하고 싶었어요.',
  },
  breakup: {
    subject: 'Closing the loop — {company}',
    body_en: 'Hi {contact},\n\nI\'ll keep this short — if K-Beauty OEM isn\'t a priority right now, totally understood. The door is open whenever the timing is right.\n\nBest,\nTeddy',
    body_ko: '안녕하세요,\n\n지금 우선순위가 아니라면 충분히 이해합니다. 언제든 준비되시면 연락 주세요.',
  },
};

export default function Emails() {
  const [selectedEmail, setSelectedEmail] = useState<(typeof emailsData)[0] | null>(null);
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [buyers, setBuyers] = useState<any[]>([]);
  const [selectedBuyerForDraft, setSelectedBuyerForDraft] = useState('');
  const [draftType, setDraftType] = useState('initial');
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftPreview, setDraftPreview] = useState<any>(null);

  useEffect(() => {
    fetchBuyers();
  }, []);

  async function fetchBuyers() {
    try {
      const { data, error } = await supabase.from('buyers').select('*').order('company_name');
      if (!error && data) {
        setBuyers(data);
      }
    } catch (error) {
      console.warn('Fetch buyers error:', error);
    }
  }

  function generateEmailDraft(buyer: any, type: string) {
    const regionTier = `${buyer.region}-${buyer.tier}`;
    let template: any = null;

    if (type === 'initial') {
      template = (emailTemplates.initial as any)[regionTier] || emailTemplates.initial['Tier2'];
    } else if (type === 'followup1') {
      template = emailTemplates.followup1;
    } else if (type === 'followup2') {
      template = emailTemplates.followup2;
    } else if (type === 'breakup') {
      template = emailTemplates.breakup;
    }

    if (!template) {
      template = emailTemplates.initial['Tier2'];
    }

    const subject = template.subject
      .replace('{company}', buyer.company_name);

    const body_en = template.body_en
      .replace('{contact}', buyer.contact_name || 'there')
      .replace('{company}', buyer.company_name)
      .replace('{region}', buyer.region);

    const body_ko = template.body_ko
      .replace('{contact}', buyer.contact_name || '담당자분')
      .replace('{company}', buyer.company_name)
      .replace('{region}', buyer.region);

    return { subject, body_en, body_ko };
  }

  async function handleCreateDraft() {
    if (!selectedBuyerForDraft) {
      alert('바이어를 선택하세요');
      return;
    }

    setDraftLoading(true);
    try {
      const buyer = buyers.find((b) => b.id === selectedBuyerForDraft);
      if (!buyer) return;

      const draft = generateEmailDraft(buyer, draftType);
      setDraftPreview({ ...draft, buyerId: buyer.id, buyerName: buyer.company_name });

      // Save to Supabase
      const { error } = await supabase.from('email_logs').insert([
        {
          buyer_id: buyer.id,
          email_type: draftType,
          subject: draft.subject,
          body_en: draft.body_en,
          body_ko: draft.body_ko,
          status: 'draft',
          pipedrive_bcc_sent: false,
        },
      ]);

      if (!error) {
        alert('초안이 저장되었습니다');
        setShowDraftModal(false);
        setSelectedBuyerForDraft('');
        setDraftType('initial');
      }
    } catch (error) {
      console.error('Draft creation error:', error);
      alert('초안 생성 실패');
    } finally {
      setDraftLoading(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-auto">
      {/* Topbar */}
      <div className="sticky top-0 bg-[#0f172a] border-b border-[#334155] px-8 py-6 z-10">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-[#f1f5f9]">이메일 로그</h1>
            <p className="text-sm text-[#94a3b8] mt-1">총 {emailsData.length}통 발송됨</p>
          </div>
          <button
            onClick={() => setShowDraftModal(true)}
            className="px-6 py-2 bg-[#3b82f6] rounded-lg text-white font-semibold hover:bg-[#2563eb] transition"
          >
            + 이메일 초안 생성
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-8">
        <div className="grid grid-cols-3 gap-6 h-full">
          {/* Email List */}
          <div className="col-span-2 space-y-2 overflow-y-auto">
            {emailsData.map((email) => {
              const status = statusIcons[email.status];
              return (
                <div
                  key={email.id}
                  onClick={() => setSelectedEmail(email)}
                  className={`p-4 rounded-lg border cursor-pointer transition ${
                    selectedEmail?.id === email.id
                      ? 'bg-[#273549] border-[#3b82f6]'
                      : 'bg-[#1e293b] border-[#334155] hover:border-[#475569]'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="font-semibold text-[#e2e8f0]">{email.company}</div>
                      <div className="text-xs text-[#94a3b8] mt-1">{email.to}</div>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded font-medium ${status.bg} ${status.text}`}>
                      {status.label}
                    </span>
                  </div>
                  <div className="text-sm text-[#cbd5e1] truncate mb-2">{email.subject}</div>
                  <div className="flex items-center gap-4 text-xs text-[#64748b]">
                    <div>발송: {email.sent}</div>
                    {email.opened && <div>열람: {email.opened}</div>}
                    {email.replied && <div>회신: {email.replied}</div>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Email Detail */}
          <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-6 flex flex-col h-full">
            {selectedEmail ? (
              <>
                <div className="border-b border-[#334155] pb-4 mb-4">
                  <div className="text-sm text-[#94a3b8]">To</div>
                  <div className="text-[#f1f5f9] font-semibold">{selectedEmail.to}</div>
                </div>

                <div className="border-b border-[#334155] pb-4 mb-4">
                  <div className="text-sm text-[#94a3b8]">Subject</div>
                  <div className="text-[#f1f5f9] font-semibold text-sm mt-1">{selectedEmail.subject}</div>
                </div>

                <div className="border-b border-[#334155] pb-4 mb-4">
                  <div className="text-sm text-[#94a3b8] mb-2">상태 추적</div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">✓</span>
                      <div>
                        <div className="text-xs text-[#94a3b8]">발송됨</div>
                        <div className="text-xs text-[#64748b]">{selectedEmail.sent}</div>
                      </div>
                    </div>
                    {selectedEmail.opened && (
                      <div className="flex items-center gap-2">
                        <span className="text-lg">👁</span>
                        <div>
                          <div className="text-xs text-[#94a3b8]">열람됨</div>
                          <div className="text-xs text-[#64748b]">{selectedEmail.opened}</div>
                        </div>
                      </div>
                    )}
                    {selectedEmail.replied && (
                      <div className="flex items-center gap-2">
                        <span className="text-lg">↩</span>
                        <div>
                          <div className="text-xs text-[#94a3b8]">회신됨</div>
                          <div className="text-xs text-[#64748b]">{selectedEmail.replied}</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <div className="text-sm text-[#94a3b8] mb-2">기본 정보</div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-[#64748b]">회사:</span>
                      <span className="text-[#e2e8f0]">{selectedEmail.company}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#64748b]">지역:</span>
                      <span className="text-[#e2e8f0]">{selectedEmail.region}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#64748b]">클릭:</span>
                      <span className={selectedEmail.clicked ? 'text-[#22c55e]' : 'text-[#ef4444]'}>
                        {selectedEmail.clicked ? '예' : '아니오'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex-1"></div>
                <button className="w-full mt-4 px-4 py-2 bg-[#3b82f6] rounded-lg text-white text-sm font-semibold hover:bg-[#2563eb] transition">
                  팔로업 이메일 작성
                </button>
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-[#64748b]">
                이메일을 선택하세요
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Draft Creation Modal */}
      {showDraftModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1e293b] border border-[#334155] rounded-lg max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-[#f1f5f9]">이메일 초안 생성</h2>
              <button
                onClick={() => setShowDraftModal(false)}
                className="text-[#94a3b8] hover:text-[#f1f5f9] text-2xl"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              {/* Buyer Selection */}
              <div>
                <label className="block text-xs font-semibold text-[#94a3b8] mb-1">
                  바이어 선택 <span className="text-[#ef4444]">*</span>
                </label>
                <select
                  value={selectedBuyerForDraft}
                  onChange={(e) => setSelectedBuyerForDraft(e.target.value)}
                  className="w-full bg-[#0f172a] border border-[#334155] text-[#e2e8f0] px-3 py-2 rounded-lg text-sm"
                >
                  <option value="">바이어를 선택하세요</option>
                  {buyers.map((buyer) => (
                    <option key={buyer.id} value={buyer.id}>
                      {buyer.company_name} ({buyer.region} / {buyer.tier})
                    </option>
                  ))}
                </select>
              </div>

              {/* Email Type */}
              <div>
                <label className="block text-xs font-semibold text-[#94a3b8] mb-1">
                  이메일 타입 <span className="text-[#ef4444]">*</span>
                </label>
                <select
                  value={draftType}
                  onChange={(e) => setDraftType(e.target.value)}
                  className="w-full bg-[#0f172a] border border-[#334155] text-[#e2e8f0] px-3 py-2 rounded-lg text-sm"
                >
                  <option value="initial">첫 번째 - Initial</option>
                  <option value="followup1">두 번째 - Follow-up 1</option>
                  <option value="followup2">세 번째 - Follow-up 2</option>
                  <option value="breakup">마지막 - Breakup</option>
                </select>
              </div>

              {/* Preview Button */}
              {selectedBuyerForDraft && (
                <div>
                  <button
                    onClick={() => {
                      const buyer = buyers.find((b) => b.id === selectedBuyerForDraft);
                      if (buyer) {
                        const draft = generateEmailDraft(buyer, draftType);
                        setDraftPreview({ ...draft, buyerName: buyer.company_name });
                      }
                    }}
                    className="w-full px-4 py-2 bg-[#475569] rounded-lg text-[#e2e8f0] text-sm font-semibold hover:bg-[#64748b] transition"
                  >
                    미리보기
                  </button>
                </div>
              )}

              {/* Preview */}
              {draftPreview && (
                <div className="bg-[#0f172a] border border-[#334155] rounded-lg p-4 space-y-2">
                  <div className="text-xs text-[#94a3b8] font-semibold">Subject</div>
                  <div className="text-sm text-[#e2e8f0] break-words">{draftPreview.subject}</div>
                  <div className="text-xs text-[#94a3b8] font-semibold mt-3">영문 본문</div>
                  <div className="text-xs text-[#cbd5e1] whitespace-pre-wrap break-words max-h-[200px] overflow-y-auto">
                    {draftPreview.body_en}
                  </div>
                  <div className="text-xs text-[#94a3b8] font-semibold mt-3">한글 본문</div>
                  <div className="text-xs text-[#cbd5e1] whitespace-pre-wrap break-words max-h-[200px] overflow-y-auto">
                    {draftPreview.body_ko}
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowDraftModal(false)}
                className="flex-1 px-4 py-2 bg-[#334155] rounded-lg text-[#e2e8f0] text-sm font-semibold hover:bg-[#475569] transition"
              >
                취소
              </button>
              <button
                onClick={handleCreateDraft}
                disabled={draftLoading || !selectedBuyerForDraft}
                className="flex-1 px-4 py-2 bg-[#3b82f6] rounded-lg text-white text-sm font-semibold hover:bg-[#2563eb] transition disabled:opacity-50"
              >
                {draftLoading ? '생성 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
