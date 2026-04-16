'use client';

import { useState, useEffect } from 'react';
import { Check, X, Send, Search, Bot, Building2, Lightbulb, FlaskConical, Target, Pencil, RefreshCw, Paperclip, CheckCircle, AlertCircle, MailOpen, FileText } from 'lucide-react';
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

// PR5: 하드코딩 템플릿 완전 삭제.
// 과거에는 인텔 없이도 변수 치환 템플릿으로 메일을 보낼 수 있었으나, 대표님 방침에 따라
// 초개인화 인텔 기반 초안만 발송 가능. 초안은 직원 D가 email_drafts에 영문으로 저장.
// 모달 열 때 email_drafts를 조회해 로드하고, 없으면 "파이프라인 먼저 실행" 안내.

export default function EmailComposeModal({ isOpen, onClose, onSent, buyer }: EmailComposeModalProps) {
  const [currentTab, setCurrentTab] = useState<'en' | 'ko' | 'intel'>('en');
  const [emailBody, setEmailBody] = useState('');
  const [koreanBody, setKoreanBody] = useState('');
  const [subject, setSubject] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [attachPDF1, setAttachPDF1] = useState(true);
  const [attachPDF2, setAttachPDF2] = useState(false);

  // Buyer intel state
  const [intel, setIntel] = useState<any>(null);
  const [intelLoading, setIntelLoading] = useState(false);
  const [intelLoaded, setIntelLoaded] = useState(false);

  // PR5.2: 모달 인텔 탭에서 국문 초안 생성 → 영문 변환·저장 플로우
  //   BuyerIntelDrawer와 동일 패턴 복제 — "첫 발송" 버튼 클릭 경로에서도
  //   초안 없이 모달에 들어왔을 때 바로 생성 가능하도록.
  const [draftKo, setDraftKo] = useState<{ subject: string; body: string } | null>(null);
  const [generatingKo, setGeneratingKo] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // PR5: email_drafts 로드 상태
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftExists, setDraftExists] = useState(false);
  // 로드된 초안의 스팸 상태 ('pass'=통과, 'rewrite'=자동수정 통과). 투명성 배지용.
  const [draftSpamStatus, setDraftSpamStatus] = useState<string | null>(null);
  // 바이어가 intel_failed 또는 recent_news=null → 발송 차단
  const [intelMissing, setIntelMissing] = useState(false);

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

  // PR5.3: generate_ko 호출을 direct fetch로 전환 — supabase.functions.invoke가 non-2xx 본문을
  //   버려 "non-2xx status code"만 노출되던 문제 해결. 실제 서버 에러 메시지 노출.
  const handleGenerateKo = async () => {
    if (generatingKo || !intel) return;
    const buyerId = (buyer as { id?: string }).id;
    const contactId = (buyer as { contact_id?: string | null }).contact_id;
    if (!buyerId || !contactId) {
      setGenerateError('바이어/담당자 ID가 없어 초안을 생성할 수 없습니다.');
      return;
    }
    // intel.raw가 비어 있으면 generate-draft가 "buyer/contact/intel 필요"로 400 반환 → 미리 차단.
    if (!intel.raw || typeof intel.raw !== 'object' || Object.keys(intel.raw).length === 0) {
      setGenerateError('인텔 원본 데이터(intel.raw)가 없어 초안을 생성할 수 없습니다. 인텔 새로고침을 먼저 시도하세요.');
      return;
    }
    setGeneratingKo(true);
    setGenerateError(null);
    setDraftKo(null);
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      const res = await fetch(`${supabaseUrl}/functions/v1/generate-draft`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseAnonKey}`,
          apikey: supabaseAnonKey,
        },
        body: JSON.stringify({
          action: 'generate_ko',
          buyer: {
            id: buyerId,
            company_name: buyer.company,
            region: buyer.region,
            tier: buyer.tier,
          },
          contact: {
            contact_name: buyer.contact,
            contact_title: (buyer as { title?: string }).title || '',
            contact_email: buyer.email,
          },
          intel: intel.raw,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
      }
      if (!data?.ko_subject || !data?.ko_body) {
        throw new Error('국문 초안 응답 형식 오류');
      }
      setDraftKo({ subject: data.ko_subject, body: data.ko_body });
      setKoreanBody(data.ko_body);
    } catch (e) {
      setGenerateError(e instanceof Error ? e.message : '국문 초안 생성 실패');
    } finally {
      setGeneratingKo(false);
    }
  };

  // PR5.2: 생성된 국문 초안 → 영문 번역 + email_drafts INSERT (generate-draft translate_save 액션).
  //   이후 모달 영문 탭(emailBody/subject)에도 반영해 사용자가 바로 검토·발송할 수 있게.
  const handleTranslateAndSave = async () => {
    if (translating || !draftKo) return;
    const buyerId = (buyer as { id?: string }).id;
    const contactId = (buyer as { contact_id?: string | null }).contact_id;
    if (!buyerId || !contactId) {
      setGenerateError('바이어/담당자 ID가 없어 저장할 수 없습니다.');
      return;
    }
    setTranslating(true);
    setGenerateError(null);
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      // PR6: pass 상태 초안이 존재해 409 DRAFT_PASS_EXISTS 수신 시 사용자 확인 후 force=true로 재시도.
      //   실수로 직원 E가 검증 완료한 초안을 날리지 않도록 반드시 confirm 경유.
      const callEdge = (force: boolean) =>
        fetch(`${supabaseUrl}/functions/v1/generate-draft`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${supabaseAnonKey}`,
            apikey: supabaseAnonKey,
          },
          body: JSON.stringify({
            action: 'translate_save',
            buyer: { id: buyerId, tier: buyer.tier },
            contact: { id: contactId },
            ko_draft: draftKo,
            ...(force && { force: true }),
          }),
        });

      let res = await callEdge(false);
      let data = await res.json().catch(() => ({}));

      if (res.status === 409 && data?.code === 'DRAFT_PASS_EXISTS') {
        const ok = window.confirm(
          `이 바이어의 기존 초안은 직원 E가 'pass'로 검증 완료한 상태입니다.\n` +
          `덮어쓰면 기존 초안이 삭제되고 직원 E 재검증(Claude API 호출)이 발생합니다.\n\n` +
          `정말 덮어쓰시겠습니까?`
        );
        if (!ok) return;
        res = await callEdge(true);
        data = await res.json().catch(() => ({}));
      }

      if (!res.ok || !data?.success) {
        throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
      }
      // 저장된 영문 초안을 모달에도 즉시 반영 (DB 재조회 없이)
      if (data.en_subject) setSubject(data.en_subject);
      // translate_save 응답에는 en_body가 없으므로 DB에서 다시 로드
      const { data: saved } = await supabase
        .from('email_drafts')
        .select('subject_line_1, body_first')
        .eq('id', data.draft_id)
        .maybeSingle();
      if (saved?.body_first) {
        setSubject(saved.subject_line_1 || data.en_subject || '');
        setEmailBody(saved.body_first);
      }
      setDraftExists(true);
      setDraftSpamStatus(null); // 새로 생성된 초안 — 직원 E 검증 전. "자동수정 통과" 배지 해제.
      setCurrentTab('en');
    } catch (e) {
      setGenerateError(e instanceof Error ? e.message : '영문 번역/저장 실패');
    } finally {
      setTranslating(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      // PR5: 하드코딩 템플릿 제거. 모달 열면 초안/인텔을 DB에서 조회해 로드.
      //   1. buyer.id로 recent_news + status 조회 → 인텔 존재 여부 판별
      //   2. status='intel_failed' 또는 recent_news=null이면 intelMissing=true, 발송 차단
      //   3. 인텔이 있으면 email_drafts에서 해당 컨택트의 미발송 초안 로드
      //      - body_first(영문), subject_line_1을 emailBody/subject에 주입
      //      - 초안이 없으면 빈 상태 + "초안 없음" 안내
      setEmailBody('');
      setKoreanBody('');
      setSubject('');
      setIntel(null);
      setIntelLoaded(false);
      setDraftExists(false);
      setDraftSpamStatus(null);
      setIntelMissing(false);
      setDraftLoading(true);
      // PR5.2: 초안 생성 state도 리셋
      setDraftKo(null);
      setGenerateError(null);
      document.body.style.overflow = 'hidden';

      (async () => {
        const buyerId = (buyer as { id?: string }).id;
        if (!buyerId) {
          setIntelMissing(true);
          setDraftLoading(false);
          return;
        }

        // 1) 인텔 & status 확인
        const { data: b } = await supabase
          .from('buyers')
          .select('recent_news, status')
          .eq('id', buyerId)
          .single();
        const hasIntel = !!b?.recent_news && b?.status !== 'intel_failed';
        if (!hasIntel) {
          setIntelMissing(true);
          setDraftLoading(false);
          return;
        }

        // 2) 미발송 초안 로드 (컨택트별)
        //    - email_count 기반으로 body 필드 선택: 0회 → body_first, 1회+ → body_followup
        //    - spam_status는 'pass' 또는 'rewrite'(자동 수정 통과)만 발송 가능으로 간주.
        //      null(미검증)/flag(위험)은 로드하되 배너로 안내.
        const contactId = (buyer as { contact_id?: string | null }).contact_id;
        if (contactId) {
          const { data: draft } = await supabase
            .from('email_drafts')
            .select('subject_line_1, body_first, body_followup, spam_status')
            .eq('buyer_contact_id', contactId)
            .eq('is_sent', false)
            .maybeSingle();
          if (draft) {
            const count = buyer.email_count ?? 0;
            // 팔로업 이후 차수는 body_followup, 없으면 body_first 폴백
            const body = count === 0
              ? (draft.body_first || '')
              : (draft.body_followup || draft.body_first || '');
            const ss = draft.spam_status;
            // 검증 통과 초안만 자동 로드. 미검증/flag는 draftExists=false로 처리 → "검증 미통과" 배너 표시.
            if (body && (ss === 'pass' || ss === 'rewrite')) {
              setSubject(draft.subject_line_1 || '');
              setEmailBody(body);
              setDraftExists(true);
              setDraftSpamStatus(ss as string);
            }
          }
        }
        setDraftLoading(false);
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

  const handleSend = async () => {
    if (!buyer.email) {
      alert('이메일 주소가 없습니다. 바이어 DB를 확인해주세요.');
      return;
    }
    // PR5: 인텔 없는 바이어는 발송 금지
    if (intelMissing) {
      alert('바이어 인텔이 없어 발송할 수 없습니다. 파이프라인을 먼저 실행하세요.');
      return;
    }
    if (!subject.trim() || !emailBody.trim()) {
      alert('제목과 본문을 모두 입력해주세요. (초안이 없으면 바이어 인텔 탭에서 생성)');
      return;
    }
    // PR6.1: 검증 미통과(null/flag) 초안 발송 차단. 직원 E가 'pass' 또는 'rewrite'(자동수정 통과) 처리한 초안만 발송 허용.
    //   Step 4 force 재생성 후 spam_status=null 상태로 emailBody가 채워지는 경로에서 이 가드가 실제로 발동.
    if (draftExists && draftSpamStatus !== 'pass' && draftSpamStatus !== 'rewrite') {
      alert('직원 E가 스팸 검증을 완료한 초안만 발송할 수 있습니다. 다음 파이프라인 실행 시 검증이 완료된 후 발송하세요.');
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

      // PR2: supabase.functions.invoke()는 non-2xx 응답 본문을 버리고 "non-2xx status code"라는
      // 일반 오류만 던져 진단이 어렵다. 직접 fetch로 호출해 실제 서버 error 메시지를 노출.
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseAnonKey}`,
          apikey: supabaseAnonKey,
        },
        body: JSON.stringify({
          to: buyer.email,
          toName: buyer.contact,
          subject,
          body: emailBody,
          buyerId: buyer.id || null,
          contactId: buyer.contact_id || null,
          emailType: autoEmailType,
        }),
      });

      let data: { success?: boolean; error?: string; warning?: string; message?: string };
      try {
        data = await res.json();
      } catch {
        throw new Error(`응답 파싱 실패 (HTTP ${res.status})`);
      }

      if (!res.ok) {
        // Edge Function이 4xx/5xx 반환 — body의 error 필드를 그대로 보여줌
        throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
      }
      if (!data?.success) {
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

  // PR5: applyAIPreset 하드코딩 프리셋(더 짧게/친근한 톤/격식체/CTA 강화) 완전 삭제.
  //   인텔 반영 여부와 무관하게 고정된 영문 템플릿을 덮어쓰는 기능이라 PR5 방침과 충돌.
  //   톤 조정이 필요하면 BuyerIntelDrawer에서 국문 초안을 수정 → 영문 번역 경로 사용.

  // 국문 → 영문 번역 (DB 저장 없음, emailBody/subject만 갱신).
  // PR5: supabase.functions.invoke는 non-2xx 응답 본문을 버려 "non-2xx status code"라는 일반 오류만
  //   노출 → Edge Function 로그까지 봐야 원인 특정 가능. 직접 fetch로 전환해 실제 에러 메시지 표시.
  //
  // TODO: 사용자가 textarea에서 emailBody/subject를 직접 수정해도 email_drafts 테이블에 동기화되지
  //   않아 이후 팔로업 초안 생성 시 원본 기준으로 돌아감. 수정본 저장이 필요하면 별도 "초안 업데이트"
  //   버튼을 두거나 onBlur에서 UPDATE 호출하는 방식으로 확장(현 범위는 로드→발송에 집중).
  const applyKoToEn = async () => {
    if (isLoading) return; // 연타 방지
    if (!koreanBody.trim()) {
      alert('국문 탭 내용이 비어 있습니다.');
      return;
    }
    // translate_only 액션은 ko_subject + ko_body 모두 필수. subject(영문 제목)가 비어 있으면
    //   draftKo.subject(국문 제목) 폴백, 그것도 없으면 회사명 기반 기본 제목 사용.
    const koSubject = subject.trim() || draftKo?.subject || `${buyer.company} — K-Beauty OEM/ODM 제안`;
    setIsLoading(true);
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      const res = await fetch(`${supabaseUrl}/functions/v1/generate-draft`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseAnonKey}`,
          apikey: supabaseAnonKey,
        },
        body: JSON.stringify({
          action: 'translate_only',
          ko_subject: koSubject,
          ko_body: koreanBody,
        }),
      });

      let data: { en_subject?: string; en_body?: string; error?: string; message?: string };
      try { data = await res.json(); } catch { throw new Error(`응답 파싱 실패 (HTTP ${res.status})`); }

      if (!res.ok) {
        throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
      }
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

  // PR6.1: 발송 버튼 비활성화 + 툴팁 판단용. handleSend의 가드와 동일 조건 — 단일 진실 유지.
  const draftValidationPending = draftExists && draftSpamStatus !== 'pass' && draftSpamStatus !== 'rewrite';

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
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="bg-[#635BFF]/15 text-[#635BFF] text-xs px-2 py-0.5 rounded">
                    <Check size={14} className="inline" /> 스팸 점수 85/100 — 안전
                  </span>
                  {/* PR5: 자동수정 통과(rewrite) 초안임을 투명하게 표시 */}
                  {draftSpamStatus === 'rewrite' && (
                    <span className="bg-[#fef3c7] text-[#b45309] text-xs px-2 py-0.5 rounded" title="직원 E가 스팸 규칙 위반을 자동 수정한 뒤 통과 처리한 초안. 발송 전 본문 최종 확인 권장.">
                      자동수정 통과
                    </span>
                  )}
                  {/* PR6: 신규 생성·강제 재생성 후 spam_status=null 상태 — 직원 E 재검증 대기 중임을 투명하게 노출 */}
                  {draftExists && draftSpamStatus === null && (
                    <span className="bg-[#fef3c7] text-[#b45309] text-xs px-2 py-0.5 rounded" title="본문이 변경되어 기존 스팸 검증이 무효화된 상태. 다음 파이프라인 실행 시 직원 E가 재검증합니다.">
                      검증 대기 중
                    </span>
                  )}
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
                {/* PR5: 인텔 없음 경고 — 발송 차단 안내 */}
                {intelMissing && (
                  <div className="bg-[#fef2f2] border-b border-[#fecaca] px-6 py-3 flex items-start gap-3">
                    <div className="w-7 h-7 rounded-full bg-[#fee2e2] flex items-center justify-center flex-shrink-0">
                      <AlertCircle size={14} className="text-[#b91c1c]" />
                    </div>
                    <div className="text-xs text-[#1a1f36] leading-relaxed flex-1">
                      <div className="font-semibold mb-0.5">바이어 인텔이 없어 발송할 수 없습니다.</div>
                      <div className="text-[#697386]">파이프라인을 먼저 실행하여 직원 C의 기업 분석을 완료하세요. 또는 이 바이어가 `intel_failed`로 마킹되어 있으면 품질 미달로 제외 상태입니다.</div>
                    </div>
                  </div>
                )}

                {/* PR5: 초안 로드 안내 — 상황별 분리
                    a) contactId가 null인 레거시 바이어(buyer_contacts에 row 없음) → 담당자 추가 안내
                    b) contactId 있는데 초안 없음 → 파이프라인/BuyerIntelDrawer로 유도
                    c) 초안은 있는데 검증 미통과(spam_status=null 또는 'flag') → 직원 E 재실행 안내 */}
                {!intelMissing && !draftLoading && !draftExists && (
                  <div className="bg-[#fffbeb] border-b border-[#fde68a] px-6 py-3 flex items-start gap-3">
                    <div className="w-7 h-7 rounded-full bg-[#fef3c7] flex items-center justify-center flex-shrink-0">
                      <AlertCircle size={14} className="text-[#b45309]" />
                    </div>
                    <div className="text-xs text-[#1a1f36] leading-relaxed flex-1">
                      {!(buyer as { contact_id?: string | null }).contact_id ? (
                        <>
                          <div className="font-semibold mb-0.5">담당자 정보가 없어 초안을 로드할 수 없습니다.</div>
                          <div className="text-[#697386]">바이어 인텔 패널에서 담당자를 먼저 추가한 뒤 초안을 생성하세요.</div>
                        </>
                      ) : (
                        <>
                          <div className="font-semibold mb-0.5">발송 가능한 영문 초안이 없습니다.</div>
                          <div className="text-[#697386]">파이프라인(직원 D)을 실행하거나 바이어 인텔 패널의 "국문 초안 생성 → 영문 번역" 경로로 초안을 만들고 스팸 검증(직원 E) 통과 후 발송 가능합니다.</div>
                        </>
                      )}
                    </div>
                  </div>
                )}

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
                        <span className="bg-[#635BFF]/15 text-[#635BFF] text-xs px-2 py-0.5 rounded">
                          Pipedrive 자동연동
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Subject Field */}
                {/* PR6: contentEditable div → input 교체. 비제어 DOM이라 setSubject(draft.subject_line_1)
                    호출해도 표시값이 갱신되지 않던 버그(실사용 시 제목 수정 불가) 해결. */}
                <div className="px-6 py-4 border-b border-[#e3e8ee] flex-shrink-0">
                  <label htmlFor="email-subject" className="text-xs text-[#8792a2] mb-2 block">제목</label>
                  <input
                    id="email-subject"
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="제목을 입력하세요"
                    className="w-full bg-transparent text-[#1a1f36] outline-none text-sm font-semibold p-0 border-0 placeholder:text-[#8792a2] placeholder:font-normal"
                  />
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
                      <span className="absolute top-2 right-3 w-1.5 h-1.5 bg-[#635BFF] rounded-full" />
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
                            <p className="text-xs text-[#1a1f36] leading-relaxed whitespace-pre-wrap">{intel.why_kbeauty || '정보 없음'}</p>
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

                          {/* PR5.2: 국문 초안 생성 → 영문 번역·저장. BuyerIntelDrawer와 동일 플로우.
                              "첫 발송" 경로로 들어와 저장된 초안이 없을 때 여기서 바로 생성. */}
                          <div className="space-y-2 pt-1">
                            <button
                              onClick={handleGenerateKo}
                              disabled={generatingKo || !intel || !(buyer as { contact_id?: string | null }).contact_id || draftKo !== null}
                              className="w-full text-xs bg-[#635BFF] text-white py-2.5 rounded-lg font-semibold hover:bg-[#5851DB] disabled:opacity-50 disabled:cursor-not-allowed transition"
                            >
                              {generatingKo
                                ? '국문 초안 생성 중...'
                                : draftKo
                                  ? '국문 초안 생성됨 ↓'
                                  : <><MailOpen size={14} className="inline" /> 국문 초안 생성</>}
                            </button>
                            {!(buyer as { contact_id?: string | null }).contact_id && (
                              <div className="text-xs text-[#b45309] text-center">담당자 정보가 먼저 필요합니다</div>
                            )}

                            {draftKo && (
                              <div className="bg-[#f6f8fa] border border-[#635BFF]/40 rounded-lg p-3 space-y-2">
                                <div className="text-xs font-semibold text-[#7A73FF]">
                                  <FileText size={14} className="inline" /> 국문 초안 (검토 후 영문 반영)
                                </div>
                                <div className="text-xs font-semibold text-[#1a1f36]">{draftKo.subject}</div>
                                <textarea
                                  value={draftKo.body}
                                  onChange={(e) => setDraftKo({ ...draftKo, body: e.target.value })}
                                  className="w-full text-xs bg-white border border-[#e3e8ee] rounded p-2 text-[#1a1f36] min-h-[120px] resize-y focus:outline-none focus:border-[#635BFF]"
                                />
                                <button
                                  onClick={handleTranslateAndSave}
                                  disabled={translating}
                                  className="w-full text-xs bg-[#635BFF] text-white py-2 rounded-lg font-semibold hover:bg-[#5851DB] disabled:opacity-50 transition"
                                >
                                  {translating ? '영문 번역·저장 중...' : '영문에 반영 (DB 저장)'}
                                </button>
                              </div>
                            )}

                            {generateError && (
                              <div className="bg-[#fef2f2] border border-[#fecaca] rounded p-2 text-xs text-[#b91c1c]">
                                오류: {generateError}
                              </div>
                            )}

                            <button
                              onClick={() => { setIntelLoaded(false); setIntel(null); fetchIntel(); }}
                              disabled={intelLoading}
                              className="w-full text-xs border border-[#e3e8ee] text-[#697386] py-2 rounded-lg hover:bg-[#e3e8ee] transition flex items-center justify-center gap-1"
                            >
                              <RefreshCw size={14} /> 인텔 새로고침
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

                {/* PR5: AI 프리셋 섹션 삭제 — 하드코딩 영문 템플릿 프리셋(더 짧게/친근한 톤 등)은 인텔 기반 발송 원칙에서 벗어남.
                    톤 조정이 필요하면 BuyerIntelDrawer에서 국문 초안을 수정 후 영문으로 재번역. */}

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
                        {attachPDF1 && <span className="text-xs text-[#635BFF]"><Check size={14} className="inline" /> 첨부됨</span>}
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
                        {attachPDF2 && <span className="text-xs text-[#635BFF]"><Check size={14} className="inline" /> 첨부됨</span>}
                      </div>
                    </div>
                    <div className="mt-3 border-2 border-dashed border-[#e3e8ee] rounded-lg p-4 text-center cursor-pointer hover:border-[#635BFF] transition">
                      <div className="text-lg mb-1"><Paperclip size={18} className="inline" /></div>
                      <div className="text-xs text-[#8792a2]">파일을 드래그하거나 클릭</div>
                    </div>
                  </div>

                  {/* 발송 전 체크 — Stripe 스타일 화이트 카드 + 체크 아이콘만 색상 강조 */}
                  <div className="px-4 py-4 border-b border-[#e3e8ee]">
                    <div className="bg-white border border-[#e3e8ee] rounded-lg p-3">
                      <div className="text-xs font-semibold text-[#1a1f36] mb-2">발송 전 체크</div>
                      <div className="space-y-1.5 text-xs text-[#697386]">
                        <div className="flex items-center gap-2"><Check size={14} className="text-[#635BFF]" /><span>스팸점수 85/100</span></div>
                        <div className="flex items-center gap-2"><Check size={14} className="text-[#635BFF]" /><span>Gmail 인박스율 100%</span></div>
                        <div className="flex items-center gap-2"><Check size={14} className="text-[#635BFF]" /><span>도메인 평판 HIGH</span></div>
                        <div className="flex items-center gap-2"><Check size={14} className="text-[#635BFF]" /><span>SPF / DKIM 통과</span></div>
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
                  disabled={isLoading || intelMissing || !emailBody.trim() || !subject.trim() || draftValidationPending}
                  title={
                    intelMissing ? '인텔이 없어 발송할 수 없습니다'
                    : (!emailBody.trim() || !subject.trim()) ? '초안이 비어 있습니다'
                    : draftValidationPending ? '스팸 검증 대기 중 — 직원 E 검증 완료 후 발송 가능'
                    : ''
                  }
                  className="px-4 py-2 bg-[#635BFF] text-white rounded-lg text-xs font-semibold hover:bg-[#5851DB] transition disabled:opacity-50 disabled:cursor-not-allowed"
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
          <div className="text-sm font-semibold text-[#635BFF] mb-1"><CheckCircle size={16} className="inline" /> 이메일 발송 완료</div>
          <div className="text-xs text-[#1a1f36] mb-2">
            {buyer.contact} ({buyer.company})에게 발송되었습니다.
          </div>
          <div className="text-xs text-[#8792a2]">Pipedrive BCC 연동 · 이메일 로그 기록 완료</div>
        </div>
      )}
    </>
  );
}
