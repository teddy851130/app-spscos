'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { displayTier, spamLevel } from '../lib/enumMap';
import EmailComposeModal from './EmailComposeModal';
import { Mail, Clock, AlertCircle, FileText, ChevronDown, ChevronUp, Send, Eye, CheckCircle } from 'lucide-react';

// ── 타입 정의 ──

interface FollowupBuyer {
  id: string;
  company_name: string;
  contact_name: string;
  contact_email: string;
  tier: string;
  region: string;
  status: string;
  last_sent_at: string | null;
  next_followup_at: string;
  email_count: number;
  contact_id?: string;
  badge: 'overdue' | 'today';
}

interface DraftItem {
  id: string;
  subject_line_1: string;
  body_first: string;
  body_followup: string;
  spam_score: number | null;
  spam_status: string | null;
  tier: string | null;
  // 조인된 바이어 정보
  company_name: string;
  contact_name: string;
  contact_email: string;
  buyer_id: string;
}

// ── 스팸 체크 (클라이언트 사이드 — run-pipeline과 동일 규칙) ──

// ADR-030: 35개 (3곳 동기화: run-pipeline · validate-draft · MailQueue.tsx)
const SPAM_WORDS = [
  "free", "guarantee", "guaranteed", "winner", "congratulations",
  "limited time", "act now", "click here", "no cost", "risk free",
  "risk-free", "exclusive deal", "don't miss", "urgent",
  "buy now", "order now", "special promotion", "no obligation",
  "double your", "earn extra", "cash bonus",
  "amazing", "ultimate", "incredible", "unbeatable",
  "hurry", "deadline", "last chance", "today only",
  "discount", "lowest price", "best price",
  "don't wait", "while supplies last", "one-time offer",
];

interface SpamCheckResult {
  score: number;         // 0~10 (10=안전, 낮을수록 위험)
  level: '낮음' | '보통' | '높음';
  issues: string[];      // 감지된 문제 목록
}

// 서버(run-pipeline 직원 E)의 checkSpamRules / autoFixSpam 규칙과 동일 조건 + 동일 스케일.
// 스케일: 1~10 (10=안전, 1=위험). 이슈 1개당 -2점, 최저 1.
// level 라벨은 "위험 수준"을 나타내며 score 값과 일관됨:
//   score 8+  → level '낮음' (위험 낮음 = 안전)
//   score 5~7 → level '보통'
//   score 1~4 → level '높음' (위험 높음)
function checkSpamClient(text: string): SpamCheckResult {
  const issues: string[] = [];
  const lower = text.toLowerCase();

  // 1. 스팸 키워드 감지
  const found = SPAM_WORDS.filter((w) => lower.includes(w));
  if (found.length > 0) issues.push(`스팸 키워드 ${found.length}개: ${found.join(', ')}`);

  // 2. SPS 도메인 링크 3개+ (PR13 ADR-032: spscos.com(서브도메인 app.spscos.com/go 포함) + legacy app-spscos.vercel.app/go 합산)
  const spsLinks = (text.match(/(?:spscos\.com|app-spscos\.vercel\.app\/go)/gi) || []).length;
  if (spsLinks >= 3) issues.push(`SPS 도메인 링크 ${spsLinks}개 (최대 2개)`);

  // 3. 외부 링크 2개+
  const allLinks = (text.match(/https?:\/\//gi) || []).length;
  const externalLinks = allLinks - spsLinks;
  if (externalLinks >= 2) issues.push(`외부 링크 ${externalLinks}개 (최대 1개)`);

  // 4. 대문자 연속 3자+
  if (/[A-Z]{3,}/.test(text)) issues.push('대문자 연속 3자+ 감지');

  // 5. 느낌표 2개+
  if (/!!/.test(text)) issues.push('느낌표 연속 사용');

  const score = Math.max(1, 10 - issues.length * 2);
  const level = score >= 8 ? '낮음' : score >= 5 ? '보통' : '높음';

  return { score, level, issues };
}

// ── 헬퍼 함수 ──
// displayTier / spamLevel은 app/lib/enumMap.ts에서 import.

// email_count 기반 메일 유형 결정
const getEmailType = (count: number): string => {
  if (count === 0) return '첫 발송';
  if (count === 1) return '1차 팔로업';
  if (count === 2) return '2차 팔로업';
  return '마지막 메일';
};

// 날짜 포맷 (M/D)
const formatDate = (dateStr: string | null): string => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

export default function MailQueue() {
  // ── 상태 ──
  const [followups, setFollowups] = useState<FollowupBuyer[]>([]);
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [loading, setLoading] = useState(true);

  // EmailComposeModal 연결 (Buyers.tsx 패턴 동일)
  const [selectedBuyer, setSelectedBuyer] = useState<any>(null);
  const [emailModalOpen, setEmailModalOpen] = useState(false);

  // "더 보기" 토글
  const [showAllFollowups, setShowAllFollowups] = useState(false);
  const [showAllDrafts, setShowAllDrafts] = useState(false);

  // 초안 미리보기 + 수정
  const [previewDraft, setPreviewDraft] = useState<DraftItem | null>(null);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [editSubject, setEditSubject] = useState('');
  const [spamResult, setSpamResult] = useState<SpamCheckResult | null>(null);
  const [saving, setSaving] = useState(false);

  const DISPLAY_LIMIT = 20;

  // ── 데이터 로드 ──
  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      await Promise.all([fetchFollowups(), fetchDrafts()]);
    } catch (err) {
      console.error('MailQueue 데이터 로드 오류:', err);
    } finally {
      setLoading(false);
    }
  }

  // 섹션 1: 팔로업 필요 바이어 조회
  async function fetchFollowups() {
    // KST 기준 오늘 끝 시간 계산
    const kstOffset = 9 * 60 * 60 * 1000; // UTC+9
    const nowUtc = new Date();
    const kstNow = new Date(nowUtc.getTime() + kstOffset);

    const kstTodayStart = new Date(kstNow);
    kstTodayStart.setHours(0, 0, 0, 0);
    const kstTodayEnd = new Date(kstNow);
    kstTodayEnd.setHours(23, 59, 59, 999);

    // UTC로 변환 (Supabase 쿼리용)
    const todayStartUtc = new Date(kstTodayStart.getTime() - kstOffset).toISOString();
    const todayEndUtc = new Date(kstTodayEnd.getTime() - kstOffset).toISOString();

    // PR4: intel_failed 바이어는 인텔 품질 미달이라 발송 대상에서 자동 제외
    const excludeStatuses = ['Lost', 'Deal', 'Bounced', 'intel_failed'];

    const { data, error } = await supabase
      .from('buyers')
      .select('id, company_name, contact_name, contact_email, tier, region, status, last_sent_at, next_followup_at, email_count')
      .not('next_followup_at', 'is', null)
      .lte('next_followup_at', todayEndUtc)
      .not('status', 'in', `(${excludeStatuses.join(',')})`)
      .order('next_followup_at', { ascending: true });

    if (error) {
      console.error('팔로업 조회 오류:', error);
      return;
    }

    if (data && data.length > 0) {
      const mapped: FollowupBuyer[] = data.map((b) => {
        const followupTime = new Date(b.next_followup_at).getTime();
        const todayStartTime = new Date(todayStartUtc).getTime();

        // overdue: 오늘 시작 전 / today: 오늘 범위 내
        const badge: 'overdue' | 'today' = followupTime < todayStartTime ? 'overdue' : 'today';

        return {
          id: b.id,
          company_name: b.company_name || '',
          contact_name: b.contact_name || '담당자',
          contact_email: b.contact_email || '',
          tier: b.tier || '',
          region: b.region || '',
          status: b.status || '',
          last_sent_at: b.last_sent_at,
          next_followup_at: b.next_followup_at,
          email_count: b.email_count ?? 0,
          badge,
        };
      });
      setFollowups(mapped);
    } else {
      setFollowups([]);
    }
  }

  // 섹션 2: 미발송 초안 조회
  // PR1 이후: email_drafts에 buyer_id 직접 저장 → 1단계 조인으로 company_name 취득.
  // buyer_contacts는 contact_name/contact_email 용도로만 조인.
  async function fetchDrafts() {
    const { data: rawDrafts, error } = await supabase
      .from('email_drafts')
      .select(`
        id, subject_line_1, body_first, body_followup,
        spam_score, spam_status, tier, buyer_id,
        buyers:buyer_id ( company_name ),
        buyer_contacts:buyer_contact_id ( contact_name, contact_email )
      `)
      .eq('is_sent', false)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('초안 조회 오류:', error);
      return;
    }

    if (!rawDrafts || rawDrafts.length === 0) {
      setDrafts([]);
      return;
    }

    const enriched: DraftItem[] = rawDrafts.map((d: Record<string, unknown>) => {
      const buyerRel = d.buyers as { company_name?: string } | null;
      const contactRel = d.buyer_contacts as { contact_name?: string; contact_email?: string } | null;
      return {
        id: d.id as string,
        subject_line_1: (d.subject_line_1 as string) || '',
        body_first: (d.body_first as string) || '',
        body_followup: (d.body_followup as string) || '',
        spam_score: d.spam_score as number | null,
        spam_status: d.spam_status as string | null,
        tier: d.tier as string | null,
        company_name: buyerRel?.company_name || '',
        contact_name: contactRel?.contact_name || '',
        contact_email: contactRel?.contact_email || '',
        buyer_id: (d.buyer_id as string) || '',
      };
    });

    setDrafts(enriched);
  }

  // ── 메일 작성 클릭 핸들러 (Buyers.tsx 패턴) ──
  const handleEmailClick = (buyer: FollowupBuyer) => {
    setSelectedBuyer({
      id: buyer.id,
      company: buyer.company_name,
      contact: buyer.contact_name,
      email: buyer.contact_email,
      region: buyer.region,
      tier: buyer.tier,
      status: buyer.status,
      email_count: buyer.email_count,
      contact_id: buyer.contact_id,
    });
    setEmailModalOpen(true);
  };

  // 발송 완료 후 해당 바이어를 큐에서 제거
  const handleEmailSent = (buyerId: string) => {
    setFollowups((prev) => prev.filter((b) => b.id !== buyerId));
  };

  // ── 표시 데이터 (상위 20건 제한) ──
  const displayedFollowups = showAllFollowups ? followups : followups.slice(0, DISPLAY_LIMIT);
  const displayedDrafts = showAllDrafts ? drafts : drafts.slice(0, DISPLAY_LIMIT);
  // 중복 제거: 같은 buyer가 팔로업 큐와 미발송 초안에 동시에 있으면 1건으로 카운트.
  // "오늘 보낼 메일" 의미는 "오늘 작업해야 할 바이어 수"이므로 고유 buyer 수가 올바름.
  const uniqueBuyerIds = new Set<string>();
  followups.forEach((f) => uniqueBuyerIds.add(f.id));
  drafts.forEach((d) => { if (d.buyer_id) uniqueBuyerIds.add(d.buyer_id); });
  const totalCount = uniqueBuyerIds.size;

  // ── 로딩 ──
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#635BFF]" />
        <span className="ml-3 text-[#697386]">메일 큐 로딩 중...</span>
      </div>
    );
  }

  // ── 빈 상태 ──
  if (totalCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-[#697386]">
        <CheckCircle size={40} className="text-[#22c55e] mb-3" />
        <p className="text-lg">오늘 보낼 메일이 없습니다</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto h-full">
    <div className="p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <Mail className="w-6 h-6 text-[#635BFF]" />
        <h2 className="text-xl font-bold text-[#1a1f36]">
          오늘 보낼 메일 ({totalCount}건)
        </h2>
      </div>

      {/* ── 섹션 1: 팔로업 필요 ── */}
      {followups.length > 0 && (
        <div className="bg-[#ffffff] rounded-xl border border-[#e3e8ee] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#e3e8ee] flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-[#1a1f36]">
              팔로업 필요 ({followups.length}건)
            </h3>
          </div>

          <div className="divide-y divide-[#e3e8ee]">
            {displayedFollowups.map((buyer) => {
              const emailType = getEmailType(buyer.email_count);
              const isOverdue = buyer.badge === 'overdue';

              return (
                <div
                  key={buyer.id}
                  className="flex items-center justify-between px-4 py-3 hover:bg-[#f6f8fa] transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {/* 배지: overdue / today */}
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium shrink-0 ${
                        isOverdue
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-amber-500/20 text-amber-400'
                      }`}
                    >
                      {isOverdue ? '지남' : '오늘'}
                    </span>

                    {/* 회사명 */}
                    <span className="text-[#1a1f36] font-medium truncate max-w-[140px]">
                      {buyer.company_name}
                    </span>

                    {/* 담당자 */}
                    <span className="text-[#697386] text-sm truncate max-w-[100px]">
                      {buyer.contact_name}
                    </span>

                    {/* Tier */}
                    <span className="text-xs text-[#8792a2] shrink-0">
                      {displayTier(buyer.tier)}
                    </span>

                    {/* 메일 유형 */}
                    <span className={`text-xs px-2 py-0.5 rounded shrink-0 ${
                      emailType === '마지막 메일'
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-blue-500/20 text-[#635BFF]'
                    }`}>
                      {emailType}
                    </span>

                    {/* 최종 발송일 */}
                    <span className="text-xs text-[#8792a2] shrink-0">
                      최종: {formatDate(buyer.last_sent_at)}
                    </span>
                  </div>

                  {/* 메일 작성 버튼 */}
                  <button
                    onClick={() => handleEmailClick(buyer)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#635BFF] hover:bg-[#5851DB] text-white text-sm rounded-lg transition-colors shrink-0 ml-3"
                  >
                    <Send className="w-3.5 h-3.5" />
                    메일 작성
                  </button>
                </div>
              );
            })}
          </div>

          {/* 더 보기 버튼 */}
          {followups.length > DISPLAY_LIMIT && (
            <button
              onClick={() => setShowAllFollowups(!showAllFollowups)}
              className="w-full px-4 py-2 text-sm text-[#635BFF] hover:text-[#5851DB] hover:bg-[#f6f8fa] transition-colors flex items-center justify-center gap-1 border-t border-[#e3e8ee]"
            >
              {showAllFollowups ? (
                <>접기 <ChevronUp className="w-4 h-4" /></>
              ) : (
                <>나머지 {followups.length - DISPLAY_LIMIT}건 더 보기 <ChevronDown className="w-4 h-4" /></>
              )}
            </button>
          )}
        </div>
      )}

      {/* ── 섹션 2: 미발송 초안 ── */}
      {drafts.length > 0 && (() => {
        // 한 바이어에 담당자가 여러 명이면 초안도 담당자별로 생성됨. 라벨에 둘 다 명시.
        const uniqueDraftBuyers = new Set(drafts.map((d) => d.buyer_id).filter(Boolean));
        return (
        <div className="bg-[#ffffff] rounded-xl border border-[#e3e8ee] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#e3e8ee] flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#635BFF]" />
            <h3 className="text-sm font-semibold text-[#1a1f36]">
              미발송 초안 ({drafts.length}건 · 바이어 {uniqueDraftBuyers.size}개)
            </h3>
          </div>

          <div className="divide-y divide-[#e3e8ee]">
            {displayedDrafts.map((draft) => (
              <div key={draft.id}>
                <div
                  className="flex items-center justify-between px-4 py-3 hover:bg-[#f6f8fa] transition-colors cursor-pointer"
                  onClick={() => setPreviewDraft(previewDraft?.id === draft.id ? null : draft)}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {/* 회사명 */}
                    <span className="text-[#1a1f36] font-medium truncate max-w-[140px]">
                      {draft.company_name || '회사 미상'}
                    </span>

                    {/* 담당자 */}
                    <span className="text-[#697386] text-sm truncate max-w-[100px]">
                      {draft.contact_name || '-'}
                    </span>

                    {/* 제목 (말줄임) */}
                    <span className="text-sm text-[#697386] truncate flex-1">
                      제목: {draft.subject_line_1 ? draft.subject_line_1.slice(0, 40) + (draft.subject_line_1.length > 40 ? '...' : '') : '-'}
                    </span>

                    {/* 스팸 점수 (DB 스케일: 10=안전, 1=위험) */}
                    {draft.spam_score !== null && (() => {
                      const level = spamLevel(draft.spam_score);
                      const cls = level === 'safe'
                        ? 'bg-green-500/20 text-green-600'
                        : level === 'warning'
                          ? 'bg-amber-500/20 text-amber-600'
                          : 'bg-red-500/20 text-red-600';
                      return (
                        <span className={`text-xs px-2 py-0.5 rounded shrink-0 ${cls}`}>
                          스팸: {draft.spam_score.toFixed(1)}/10
                        </span>
                      );
                    })()}
                  </div>

                  {/* 초안 보기 버튼 */}
                  <button className="flex items-center gap-1.5 px-3 py-1.5 bg-[#e3e8ee] hover:bg-[#8792a2] text-[#1a1f36] text-sm rounded-lg transition-colors shrink-0 ml-3">
                    <Eye className="w-3.5 h-3.5" />
                    초안 보기
                  </button>
                </div>

                {/* 초안 미리보기 / 수정 (토글) */}
                {previewDraft?.id === draft.id && (
                  <div className="px-4 pb-3">
                    <div className="bg-[#f6f8fa] rounded-lg p-4 border border-[#e3e8ee] space-y-3">
                      {editingDraftId === draft.id ? (
                        /* ── 수정 모드 ── */
                        <>
                          {/* 제목 수정 */}
                          <input
                            type="text"
                            value={editSubject}
                            onChange={(e) => setEditSubject(e.target.value)}
                            className="w-full bg-[#ffffff] border border-[#8792a2] rounded px-3 py-2 text-sm text-[#1a1f36] focus:border-[#635BFF] focus:outline-none"
                            placeholder="제목"
                          />
                          {/* 본문 수정 */}
                          <textarea
                            value={editBody}
                            onChange={(e) => {
                              setEditBody(e.target.value);
                              // 타이핑할 때마다 스팸 재확인
                              setSpamResult(checkSpamClient(e.target.value));
                            }}
                            className="w-full bg-[#ffffff] border border-[#8792a2] rounded px-3 py-2 text-sm text-[#1a1f36] focus:border-[#635BFF] focus:outline-none min-h-[200px] max-h-[400px] resize-y"
                            placeholder="본문"
                          />

                          {/* 스팸 재확인 결과 */}
                          {spamResult && (
                            <div className={`rounded-lg p-3 border text-sm ${
                              spamResult.level === '낮음'
                                ? 'bg-green-500/10 border-green-500/30'
                                : spamResult.level === '보통'
                                  ? 'bg-amber-500/10 border-amber-500/30'
                                  : 'bg-red-500/10 border-red-500/30'
                            }`}>
                              <div className="flex items-center gap-2 mb-1">
                                <AlertCircle className={`w-4 h-4 ${
                                  spamResult.level === '낮음' ? 'text-green-400'
                                    : spamResult.level === '보통' ? 'text-amber-400' : 'text-red-400'
                                }`} />
                                <span className={`font-semibold ${
                                  spamResult.level === '낮음' ? 'text-green-400'
                                    : spamResult.level === '보통' ? 'text-amber-400' : 'text-red-400'
                                }`}>
                                  스팸 위험: {spamResult.level} ({spamResult.score}/10)
                                </span>
                              </div>
                              {spamResult.issues.length > 0 ? (
                                <ul className="text-xs text-[#697386] space-y-0.5 ml-6">
                                  {spamResult.issues.map((issue, i) => (
                                    <li key={i}>• {issue}</li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="text-xs text-green-400 ml-6">문제 없음 — 발송해도 안전합니다</p>
                              )}
                            </div>
                          )}

                          {/* 저장/취소 버튼 */}
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => {
                                setEditingDraftId(null);
                                setSpamResult(null);
                              }}
                              className="px-3 py-1.5 text-sm text-[#697386] hover:text-[#1a1f36] transition"
                            >
                              취소
                            </button>
                            <button
                              disabled={saving}
                              onClick={async () => {
                                // ADR-027: 로컬 checkSpamClient만으로 spam_score/status 결정하던 기존 로직을
                                //   validate-draft Edge Function 호출로 교체. 로컬은 규칙 기반(5항목)만 보는데
                                //   실제 서버 판정은 Claude rubric까지 포함(ADR-025). 로컬이 "위험 낮음"(10점)을
                                //   주는 본문도 Claude 기준에서는 6~7점일 수 있어 가짜 pass가 저장되던 버그.
                                //   EmailComposeModal의 handleSaveDraft와 동일 패턴 적용.
                                setSaving(true);
                                try {
                                  // 1) 본문 UPDATE + spam_* 초기화
                                  const { error: upErr } = await supabase
                                    .from('email_drafts')
                                    .update({
                                      subject_line_1: editSubject,
                                      body_first: editBody,
                                      spam_score: null,
                                      spam_status: null,
                                    })
                                    .eq('id', draft.id);
                                  if (upErr) throw upErr;

                                  // 2) validate-draft 호출 — 규칙 + autoFixSpam + Claude rubric
                                  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
                                  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
                                  const vres = await fetch(`${supabaseUrl}/functions/v1/validate-draft`, {
                                    method: 'POST',
                                    headers: {
                                      'Content-Type': 'application/json',
                                      Authorization: `Bearer ${supabaseAnonKey}`,
                                      apikey: supabaseAnonKey,
                                    },
                                    body: JSON.stringify({ draft_id: draft.id }),
                                  });
                                  const vdata = await vres.json().catch(() => ({}));
                                  if (!vres.ok || !vdata?.success) {
                                    throw new Error(vdata?.error || `검증 실패 (HTTP ${vres.status})`);
                                  }

                                  // 3) 응답 반영. rewrite 시 validate-draft가 자동 수정본을 body_first로 UPDATE했으므로 state도 동기화.
                                  const newStatus = (vdata.spam_status as string) || 'flag';
                                  const newScore = typeof vdata.spam_score === 'number' ? vdata.spam_score : null;
                                  const finalBody = (newStatus === 'rewrite' && typeof vdata.body_first === 'string') ? vdata.body_first : editBody;

                                  setDrafts((prev) => prev.map((d) =>
                                    d.id === draft.id
                                      ? { ...d, subject_line_1: editSubject, body_first: finalBody, spam_score: newScore, spam_status: newStatus }
                                      : d
                                  ));
                                  setPreviewDraft({ ...draft, subject_line_1: editSubject, body_first: finalBody, spam_score: newScore, spam_status: newStatus });
                                  setEditingDraftId(null);
                                  setSpamResult(null);

                                  // 4) 사용자 피드백
                                  if (newStatus === 'pass') {
                                    alert(`검증 통과 (점수 ${newScore}/10). 바로 발송할 수 있습니다.`);
                                  } else if (newStatus === 'rewrite') {
                                    const fixesText = (vdata.fixes || []).join('\n• ');
                                    alert(`자동 수정 후 통과:\n• ${fixesText}\n\n본문이 일부 자동 수정되었습니다.`);
                                  } else {
                                    const detailLines: string[] = [];
                                    if (Array.isArray(vdata.issues) && vdata.issues.length > 0) detailLines.push('위반 규칙:\n• ' + vdata.issues.join('\n• '));
                                    if (typeof vdata.reason === 'string' && vdata.reason.trim()) detailLines.push('AI 분석 이유: ' + vdata.reason);
                                    const details = detailLines.length > 0 ? '\n\n' + detailLines.join('\n\n') : '';
                                    alert(`스팸 위험 판정 (점수 ${newScore ?? '-'}/10).${details}\n\n본문을 더 다듬은 뒤 다시 저장해주세요.`);
                                  }
                                } catch (e) {
                                  alert('저장/검증 실패: ' + (e instanceof Error ? e.message : String(e)));
                                } finally {
                                  setSaving(false);
                                }
                              }}
                              className="px-4 py-1.5 bg-[#635BFF] hover:bg-[#5851DB] text-white text-sm rounded-lg transition disabled:opacity-50"
                            >
                              {saving ? '검증 중...' : '저장 및 재검증'}
                            </button>
                          </div>
                        </>
                      ) : (
                        /* ── 보기 모드 ── */
                        <>
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-[#1a1f36]">
                              {draft.subject_line_1}
                            </p>
                            <button
                              onClick={() => {
                                setEditingDraftId(draft.id);
                                setEditSubject(draft.subject_line_1);
                                setEditBody(draft.body_first || draft.body_followup || '');
                                setSpamResult(checkSpamClient(draft.body_first || draft.body_followup || ''));
                              }}
                              className="px-3 py-1 text-xs bg-[#e3e8ee] hover:bg-[#8792a2] text-[#1a1f36] rounded transition"
                            >
                              수정
                            </button>
                          </div>
                          <p className="text-sm text-[#697386] whitespace-pre-wrap max-h-[400px] overflow-y-auto">
                            {draft.body_first || draft.body_followup || '내용 없음'}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* 더 보기 버튼 */}
          {drafts.length > DISPLAY_LIMIT && (
            <button
              onClick={() => setShowAllDrafts(!showAllDrafts)}
              className="w-full px-4 py-2 text-sm text-[#635BFF] hover:text-[#5851DB] hover:bg-[#f6f8fa] transition-colors flex items-center justify-center gap-1 border-t border-[#e3e8ee]"
            >
              {showAllDrafts ? (
                <>접기 <ChevronUp className="w-4 h-4" /></>
              ) : (
                <>나머지 {drafts.length - DISPLAY_LIMIT}건 더 보기 <ChevronDown className="w-4 h-4" /></>
              )}
            </button>
          )}
        </div>
        );
      })()}

      {/* ── EmailComposeModal (Buyers.tsx와 동일 패턴) ── */}
      {selectedBuyer && (
        <EmailComposeModal
          isOpen={emailModalOpen}
          onClose={() => {
            setEmailModalOpen(false);
            setSelectedBuyer(null);
          }}
          onSent={() => handleEmailSent(selectedBuyer.id)}
          buyer={selectedBuyer}
        />
      )}
    </div>
    </div>
  );
}
