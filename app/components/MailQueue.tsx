'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
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

const SPAM_WORDS = [
  "free", "guarantee", "guaranteed", "winner", "congratulations",
  "limited time", "act now", "click here", "no cost", "risk free",
  "risk-free", "exclusive deal", "don't miss", "urgent",
  "buy now", "order now", "special promotion", "no obligation",
  "double your", "earn extra", "cash bonus",
];

interface SpamCheckResult {
  score: number;         // 0~10 (10=안전, 낮을수록 위험)
  level: '낮음' | '보통' | '높음';
  issues: string[];      // 감지된 문제 목록
}

function checkSpamClient(text: string): SpamCheckResult {
  const issues: string[] = [];
  const lower = text.toLowerCase();

  // 1. 스팸 키워드 감지
  const found = SPAM_WORDS.filter((w) => lower.includes(w));
  if (found.length > 0) issues.push(`스팸 키워드 ${found.length}개: ${found.join(', ')}`);

  // 2. spscos.com 링크 3개+
  const spsLinks = (text.match(/spscos\.com/gi) || []).length;
  if (spsLinks >= 3) issues.push(`spscos.com 링크 ${spsLinks}개 (최대 2개)`);

  // 3. 외부 링크 2개+
  const allLinks = (text.match(/https?:\/\//gi) || []).length;
  const externalLinks = allLinks - spsLinks;
  if (externalLinks >= 2) issues.push(`외부 링크 ${externalLinks}개 (최대 1개)`);

  // 4. 대문자 연속 3자+
  if (/[A-Z]{3,}/.test(text)) issues.push('대문자 연속 3자+ 감지');

  // 5. 느낌표 2개+
  if (/!!/.test(text)) issues.push('느낌표 연속 사용');

  // 점수 계산: 이슈 없으면 10, 이슈당 -2
  const score = Math.max(1, 10 - issues.length * 2);
  const level = score >= 8 ? '낮음' : score >= 5 ? '보통' : '높음';

  return { score, level, issues };
}

// ── 헬퍼 함수 ──

// DB tier → 표시용 (공백 추가)
const displayTier = (t: string) => {
  if (t === 'Tier1') return 'Tier 1';
  if (t === 'Tier2') return 'Tier 2';
  if (t === 'Tier3') return 'Tier 3';
  return t;
};

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

    const excludeStatuses = ['Lost', 'Deal', 'Bounced'];

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
  async function fetchDrafts() {
    const { data: rawDrafts, error } = await supabase
      .from('email_drafts')
      .select('id, subject_line_1, body_first, body_followup, spam_score, spam_status, tier, buyer_contacts(contact_name, contact_email, buyer_id)')
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

    // buyer 정보 조인 (회사명 가져오기)
    const contactData = rawDrafts
      .map((d: Record<string, unknown>) => d.buyer_contacts as Record<string, unknown>)
      .filter(Boolean);
    const buyerIds = [...new Set(
      contactData.map((c) => c?.buyer_id).filter(Boolean)
    )] as string[];

    let buyerNameMap = new Map<string, string>();
    if (buyerIds.length > 0) {
      const { data: buyers } = await supabase
        .from('buyers')
        .select('id, company_name')
        .in('id', buyerIds);

      buyerNameMap = new Map(
        (buyers || []).map((b: { id: string; company_name: string }) => [b.id, b.company_name])
      );
    }

    const enriched: DraftItem[] = rawDrafts.map((d: Record<string, unknown>) => {
      const contact = d.buyer_contacts as Record<string, unknown> | null;
      const buyerId = (contact?.buyer_id as string) || '';
      return {
        id: d.id as string,
        subject_line_1: (d.subject_line_1 as string) || '',
        body_first: (d.body_first as string) || '',
        body_followup: (d.body_followup as string) || '',
        spam_score: d.spam_score as number | null,
        spam_status: d.spam_status as string | null,
        tier: d.tier as string | null,
        company_name: buyerNameMap.get(buyerId) || '',
        contact_name: (contact?.contact_name as string) || '',
        contact_email: (contact?.contact_email as string) || '',
        buyer_id: buyerId,
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
  const totalCount = followups.length + drafts.length;

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
      {drafts.length > 0 && (
        <div className="bg-[#ffffff] rounded-xl border border-[#e3e8ee] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#e3e8ee] flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#635BFF]" />
            <h3 className="text-sm font-semibold text-[#1a1f36]">
              미발송 초안 ({drafts.length}건)
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

                    {/* 스팸 점수 */}
                    {draft.spam_score !== null && (
                      <span className={`text-xs px-2 py-0.5 rounded shrink-0 ${
                        draft.spam_score >= 5
                          ? 'bg-red-500/20 text-red-400'
                          : draft.spam_score >= 3
                            ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-green-500/20 text-green-400'
                      }`}>
                        스팸: {draft.spam_score.toFixed(1)}
                      </span>
                    )}
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
                                setSaving(true);
                                const check = checkSpamClient(editBody);
                                const newScore = check.score;
                                const newStatus = newScore >= 8 ? 'pass' : newScore >= 5 ? 'rewrite' : 'flag';

                                const { error } = await supabase
                                  .from('email_drafts')
                                  .update({
                                    subject_line_1: editSubject,
                                    body_first: editBody,
                                    spam_score: newScore,
                                    spam_status: newStatus,
                                  })
                                  .eq('id', draft.id);

                                if (error) {
                                  alert('저장 실패: ' + error.message);
                                } else {
                                  // 로컬 상태 업데이트
                                  setDrafts((prev) => prev.map((d) =>
                                    d.id === draft.id
                                      ? { ...d, subject_line_1: editSubject, body_first: editBody, spam_score: newScore, spam_status: newStatus }
                                      : d
                                  ));
                                  setPreviewDraft({ ...draft, subject_line_1: editSubject, body_first: editBody, spam_score: newScore, spam_status: newStatus });
                                  setEditingDraftId(null);
                                  setSpamResult(null);
                                }
                                setSaving(false);
                              }}
                              className="px-4 py-1.5 bg-[#635BFF] hover:bg-[#5851DB] text-white text-sm rounded-lg transition disabled:opacity-50"
                            >
                              {saving ? '저장 중...' : '저장'}
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
      )}

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
