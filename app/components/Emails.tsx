'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface EmailLog {
  id: string;
  to_email: string;
  to_name: string;
  company: string;
  region?: string;
  subject: string;
  status: string;
  sent_at: string;
  buyer_id?: string;
}

// No more hardcoded fallback — only real data from Supabase

function formatDate(isoStr: string) {
  const d = new Date(isoStr);
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function Emails() {
  const [emails, setEmails] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);
  const [teamFilter, setTeamFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    async function fetchEmails() {
      setLoading(true);
      try {
        // 1차: email_logs 테이블 시도
        const { data, error } = await supabase
          .from('email_logs')
          .select('id, to_email, to_name, company, region, subject, status, sent_at, buyer_id')
          .order('sent_at', { ascending: false })
          .limit(100);

        if (!error && data && data.length > 0) {
          setEmails(data);
          setUsingFallback(false);
        } else {
          // 2차: buyers 테이블에서 발송 기록이 있는 바이어 조회
          // 2차 폴백: buyers 테이블에서 발송 기록 있는 바이어
          // DB status는 영어 enum → email_logs.status 형식('sent'/'replied'/'bounced')으로 매핑
          const { data: buyers } = await supabase
            .from('buyers')
            .select('id, region, company_name, contact_email, contact_name, status, last_sent_at')
            .not('status', 'eq', 'Cold')
            .order('last_sent_at', { ascending: false });

          if (buyers && buyers.length > 0) {
            const fromBuyers: EmailLog[] = buyers.map((b) => ({
              id: `buyer-${b.id}`,
              to_email: b.contact_email || '',
              to_name: b.contact_name || '',
              company: b.company_name || '',
              region: b.region || '',
              subject: 'K-Beauty OEM Partnership Opportunity — SPS International',
              // buyers.status → email_logs.status 형식 매핑
              status: b.status === 'Replied' ? 'replied'
                    : b.status === 'Bounced' ? 'bounced'
                    : 'sent',
              sent_at: b.last_sent_at || new Date().toISOString(),
              buyer_id: b.id,
            }));
            setEmails(fromBuyers);
            setUsingFallback(false);
          } else {
            // 3차: 데이터가 아예 없는 경우 — 빈 상태 표시
            setEmails([]);
            setUsingFallback(true);
          }
        }
      } catch {
        setEmails([]);
        setUsingFallback(true);
      } finally {
        setLoading(false);
      }
    }
    fetchEmails();
  }, []);

  const filtered = emails.filter((e) => {
    if (teamFilter && e.region !== teamFilter) return false;
    // email_logs.status와 buyers 매핑 모두 영어 (sent/replied/bounced)
    if (statusFilter && e.status !== statusFilter) return false;
    if (dateFrom && e.sent_at && e.sent_at < dateFrom) return false;
    if (dateTo && e.sent_at && e.sent_at > dateTo + 'T23:59:59Z') return false;
    return true;
  });

  // Count by status for the legend
  // email_logs.status 영어 기준 카운트
  const repliedCount = filtered.filter((e) => e.status === 'replied').length;
  const sentCount = filtered.filter((e) => e.status === 'sent' || e.status === 'opened').length;
  const bouncedCount = filtered.filter((e) => e.status === 'bounced').length;

  return (
    <div className="flex-1 overflow-y-auto h-full">
      <div className="p-6">

        {/* Status Legend */}
        <div className="bg-[#ffffff] border border-[#e3e8ee] rounded-lg p-4 mb-4 flex items-center gap-6">
          <div className="text-xs font-semibold text-[#8792a2] mr-2">상태 아이콘 설명:</div>
          <div className="flex items-center gap-2">
            <span className="text-xs bg-[#22c55e]/20 text-[#22c55e] px-2 py-1 rounded">✓ 회신받음</span>
            <span className="text-xs text-[#8792a2]">바이어가 답장을 보낸 상태</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs bg-[#f59e0b]/20 text-[#f59e0b] px-2 py-1 rounded">📬 발송완료</span>
            <span className="text-xs text-[#8792a2]">이메일 발송됨, 회신 대기 중</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs bg-[#ef4444]/20 text-[#ef4444] px-2 py-1 rounded">⚠ 반송됨</span>
            <span className="text-xs text-[#8792a2]">이메일 주소 오류 또는 수신 거부</span>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex gap-3 items-center mb-6 flex-wrap">
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="bg-[#ffffff] border border-[#e3e8ee] text-[#1a1f36] px-3 py-2 rounded text-xs"
          >
            <option value="">전체 팀</option>
            <option value="GCC">GCC</option>
            <option value="USA">USA</option>
            <option value="Europe">Europe</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-[#ffffff] border border-[#e3e8ee] text-[#1a1f36] px-3 py-2 rounded text-xs"
          >
            <option value="">전체 상태</option>
            <option value="sent">발송완료</option>
            <option value="replied">회신받음</option>
            <option value="bounced">반송됨</option>
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="bg-[#ffffff] border border-[#e3e8ee] text-[#1a1f36] px-3 py-2 rounded text-xs"
          />
          <span className="text-[#8792a2]">~</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="bg-[#ffffff] border border-[#e3e8ee] text-[#1a1f36] px-3 py-2 rounded text-xs"
          />
          <div className="flex-1" />
          {/* Count badges */}
          <div className="flex items-center gap-2">
            <span className="text-xs bg-[#22c55e]/20 text-[#22c55e] px-2 py-1 rounded">✓ {repliedCount}</span>
            <span className="text-xs bg-[#f59e0b]/20 text-[#f59e0b] px-2 py-1 rounded">📬 {sentCount}</span>
            {bouncedCount > 0 && (
              <span className="text-xs bg-[#ef4444]/20 text-[#ef4444] px-2 py-1 rounded">⚠ {bouncedCount}</span>
            )}
            <span className="text-xs text-[#8792a2]">총 {filtered.length}건</span>
          </div>
        </div>

        {/* Data source note */}
        {usingFallback && (
          <div className="bg-[#1e3a5f30] border border-[#635BFF40] rounded-lg p-3 mb-4 flex items-center gap-2">
            <span className="text-xs text-[#93c5fd]">
              ℹ️ 아직 이메일 발송 기록이 없습니다. 바이어 DB에서 이메일을 발송하면 여기에 표시됩니다.
            </span>
          </div>
        )}

        {/* Email Table */}
        <div className="bg-[#ffffff] border border-[#e3e8ee] rounded-lg overflow-hidden">
          {loading ? (
            <div className="py-12 text-center text-xs text-[#8792a2]">이메일 로그 로딩 중...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#e3e8ee]">
                    <th className="text-left px-4 py-3 font-semibold text-[#8792a2]">발송 일시</th>
                    <th className="text-left px-4 py-3 font-semibold text-[#8792a2]">수신자</th>
                    <th className="text-left px-4 py-3 font-semibold text-[#8792a2]">회사</th>
                    <th className="text-left px-4 py-3 font-semibold text-[#8792a2]">팀</th>
                    <th className="text-left px-4 py-3 font-semibold text-[#8792a2]">제목</th>
                    <th className="text-left px-4 py-3 font-semibold text-[#8792a2]">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((email) => (
                    <tr key={email.id} className="border-b border-[#e3e8ee] hover:bg-[#f6f8fa]">
                      <td className="px-4 py-3 text-[#8792a2] whitespace-nowrap">{formatDate(email.sent_at)}</td>
                      <td className="px-4 py-3 text-[#1a1f36]">{email.to_name || email.to_email}</td>
                      <td className="px-4 py-3 text-[#1a1f36]">{email.company}</td>
                      <td className="px-4 py-3">
                        {email.region ? (
                          <span
                            className={`text-xs px-2 py-1 rounded ${
                              email.region === 'GCC'
                                ? 'bg-[#635BFF]/20 text-[#635BFF]'
                                : email.region === 'USA'
                                ? 'bg-[#7c3aed]/20 text-[#a78bfa]'
                                : 'bg-[#0891b2]/20 text-[#4ade80]'
                            }`}
                          >
                            {email.region}
                          </span>
                        ) : (
                          <span className="text-[#8792a2]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[#697386] max-w-xs overflow-hidden text-ellipsis whitespace-nowrap">
                        {email.subject}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs px-2 py-1 rounded ${
                            email.status === 'replied'
                              ? 'bg-[#22c55e]/20 text-[#22c55e]'
                              : email.status === 'bounced'
                              ? 'bg-[#ef4444]/20 text-[#ef4444]'
                              : 'bg-[#f59e0b]/20 text-[#f59e0b]'
                          }`}
                        >
                          {email.status === 'replied' ? '✓ 회신받음' : email.status === 'bounced' ? '⚠ 반송됨' : '📬 발송완료'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-[#8792a2] text-xs">
                        검색 결과가 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
