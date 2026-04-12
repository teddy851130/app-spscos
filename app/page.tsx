'use client';

import { useState, useRef, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import Pipeline from './components/Pipeline';
import Buyers from './components/Buyers';
import Emails from './components/Emails';
import KPIReport from './components/KPIReport';
import Domain from './components/Domain';
import PipelineRunModal from './components/PipelineRunModal';
import CSVUploadModal from './components/CSVUploadModal';
import { supabase } from './lib/supabase';

const pageConfig: Record<string, { title: string; subtitle: string }> = {
  dashboard: { title: '대시보드', subtitle: '오늘 현황 · ' + new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }) },
  pipeline: { title: '파이프라인', subtitle: '자동화 워크플로우 관리' },
  buyers: { title: '바이어 DB', subtitle: '잠재 바이어 관리' },
  emails: { title: '이메일 로그', subtitle: '발송 이력' },
  kpi: { title: 'KPI 리포트', subtitle: '주간 성과 분석 · 팀별 비교' },
  domain: { title: '도메인 상태', subtitle: '이메일 전달성 모니터링' },
};

interface Notification {
  id: string;
  type: 'reply' | 'bounce' | 'info';
  title: string;
  body: string;
  time: string;
  read: boolean;
}

function timeAgo(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 5) return '방금 전';
  if (mins < 60) return `${mins}분 전`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}시간 전`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return '어제';
  return `${days}일 전`;
}

export default function Home() {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [pipelineModalOpen, setPipelineModalOpen] = useState(false);
  const [csvUploadModalOpen, setCsvUploadModalOpen] = useState(false);
  // CSV 업로드 후 Buyers 컴포넌트를 강제 재마운트해 fetch를 다시 트리거하기 위한 key
  const [buyersRefreshKey, setBuyersRefreshKey] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const notifRef = useRef<HTMLDivElement>(null);

  const config = pageConfig[currentPage] || pageConfig.dashboard;
  const unreadCount = notifications.filter((n) => !n.read).length;

  // Load real notifications from Supabase
  useEffect(() => {
    async function loadNotifications() {
      const notifs: Notification[] = [];
      // localStorage에서 읽은 알림 ID 목록 로드 (새로고침 후에도 유지)
      const readIds: string[] = JSON.parse(localStorage.getItem('sps_read_notifications') || '[]');

      // 1. 회신받음 buyers → reply 알람
      // DB는 영어 enum만 허용 — 'Replied'로 쿼리해야 실제 데이터 반환
      const { data: replied } = await supabase
        .from('buyers')
        .select('id, company_name, updated_at, last_sent_at')
        .eq('status', 'Replied')
        .order('updated_at', { ascending: false })
        .limit(5);

      if (replied) {
        replied.forEach((b) => {
          notifs.push({
            id: `reply-${b.id}`,
            type: 'reply',
            title: '회신 수신',
            body: `${b.company_name}에서 회신이 도착했습니다. 팔로업 이메일을 보내세요.`,
            time: timeAgo(b.updated_at || b.last_sent_at || new Date().toISOString()),
            read: readIds.includes(`reply-${b.id}`),
          });
        });
      }

      // 2. 반송됨 buyers → bounce 알람
      const { data: bounced } = await supabase
        .from('buyers')
        .select('id, company_name, updated_at')
        .eq('status', 'Bounced')
        .order('updated_at', { ascending: false })
        .limit(3);

      if (bounced) {
        bounced.forEach((b) => {
          notifs.push({
            id: `bounce-${b.id}`,
            type: 'bounce',
            title: '반송 경고',
            body: `${b.company_name} 이메일이 반송되었습니다. 이메일 주소를 확인해주세요.`,
            time: timeAgo(b.updated_at || new Date().toISOString()),
            read: readIds.includes(`bounce-${b.id}`),
          });
        });
      }

      // 3. 최근 7일 신규 바이어 → info 알람
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: newBuyers } = await supabase
        .from('buyers')
        .select('id, created_at')
        .gte('created_at', weekAgo);

      if (newBuyers && newBuyers.length > 0) {
        notifs.push({
          id: 'new-buyers',
          type: 'info',
          title: '신규 바이어 추가',
          body: `최근 7일간 신규 바이어 ${newBuyers.length}명이 DB에 추가되었습니다.`,
          time: '최근',
          read: true,
        });
      }

      // Sort: unread first, then by type priority
      notifs.sort((a, b) => {
        if (a.read !== b.read) return a.read ? 1 : -1;
        return 0;
      });

      setNotifications(notifs.slice(0, 10));
    }

    loadNotifications();
  }, []);

  // Close notification panel when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    if (notifOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [notifOpen]);

  const markAllRead = () => {
    const allIds = notifications.map((n) => n.id);
    const existing: string[] = JSON.parse(localStorage.getItem('sps_read_notifications') || '[]');
    const merged = [...new Set([...existing, ...allIds])];
    localStorage.setItem('sps_read_notifications', JSON.stringify(merged));
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const markRead = (id: string) => {
    const existing: string[] = JSON.parse(localStorage.getItem('sps_read_notifications') || '[]');
    if (!existing.includes(id)) {
      localStorage.setItem('sps_read_notifications', JSON.stringify([...existing, id]));
    }
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
  };

  const handleCSVImport = (_importedBuyers: any[]) => {
    // CSV 업로드는 이미 DB에 INSERT 완료된 상태로 콜백됨.
    // Buyers 페이지로 이동하면서 컴포넌트를 강제 재마운트해 새 데이터 fetch.
    setCurrentPage('buyers');
    setBuyersRefreshKey((k) => k + 1);
  };

  return (
    <div className="flex h-screen bg-[#0f172a] text-[#f1f5f9]">
      <Sidebar currentPage={currentPage} setCurrentPage={setCurrentPage} />
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <div className="h-14 bg-[#1e293b] border-b border-[#334155] flex items-center justify-between px-6 flex-shrink-0">
          <div>
            <div className="text-base font-bold text-[#f1f5f9]">{config.title}</div>
            <div className="text-xs text-[#64748b] mt-0.5">{config.subtitle}</div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setPipelineModalOpen(true)}
              className="px-3 py-1.5 bg-transparent border border-[#334155] text-[#94a3b8] rounded-lg text-xs font-semibold hover:bg-[#334155] hover:text-[#e2e8f0] transition"
            >
              ▶ 파이프라인 실행
            </button>
            <button
              onClick={() => setCsvUploadModalOpen(true)}
              className="px-3 py-1.5 bg-[#3b82f6] text-white rounded-lg text-xs font-semibold hover:bg-[#2563eb] transition"
            >
              + 바이어 추가
            </button>

            {/* Bell icon with notification panel */}
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => setNotifOpen(!notifOpen)}
                className="relative text-lg hover:opacity-80 transition p-1 rounded hover:bg-[#334155]"
                title="알림"
              >
                🔔
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-[#ef4444] rounded-full text-white text-[10px] flex items-center justify-center font-bold leading-none">
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* Notification Panel */}
              {notifOpen && (
                <div className="absolute right-0 top-10 w-[340px] bg-[#1e293b] border border-[#334155] rounded-lg shadow-2xl z-50 overflow-hidden">
                  {/* Panel Header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-[#334155]">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-[#f1f5f9]">알림</span>
                      {unreadCount > 0 && (
                        <span className="text-xs bg-[#ef4444] text-white px-1.5 py-0.5 rounded-full font-bold">
                          {unreadCount}
                        </span>
                      )}
                    </div>
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllRead}
                        className="text-xs text-[#3b82f6] hover:text-[#60a5fa] font-semibold"
                      >
                        모두 읽음
                      </button>
                    )}
                  </div>

                  {/* Notification List */}
                  <div className="max-h-[360px] overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="px-4 py-8 text-center text-xs text-[#64748b]">
                        새로운 알림이 없습니다.
                      </div>
                    ) : (
                      notifications.map((notif) => (
                        <div
                          key={notif.id}
                          onClick={() => markRead(notif.id)}
                          className={`flex items-start gap-3 px-4 py-3 border-b border-[#334155] cursor-pointer hover:bg-[#273549] transition ${
                            !notif.read ? 'bg-[#1e3a5f20]' : ''
                          }`}
                        >
                          <div className="flex-shrink-0 mt-0.5">
                            {notif.type === 'reply' && <span className="text-base">✉️</span>}
                            {notif.type === 'bounce' && <span className="text-base">⚠️</span>}
                            {notif.type === 'info' && <span className="text-base">ℹ️</span>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className={`text-xs font-semibold ${!notif.read ? 'text-[#f1f5f9]' : 'text-[#94a3b8]'}`}>
                                {notif.title}
                              </span>
                              <span className="text-xs text-[#475569] whitespace-nowrap flex-shrink-0">{notif.time}</span>
                            </div>
                            <p className="text-xs text-[#64748b] mt-0.5 leading-relaxed">{notif.body}</p>
                          </div>
                          {!notif.read && (
                            <div className="w-2 h-2 bg-[#3b82f6] rounded-full flex-shrink-0 mt-1" />
                          )}
                        </div>
                      ))
                    )}
                  </div>

                  {/* Panel Footer */}
                  <div className="px-4 py-3 border-t border-[#334155] text-center">
                    <button
                      onClick={() => { setCurrentPage('emails'); setNotifOpen(false); }}
                      className="text-xs text-[#3b82f6] hover:text-[#60a5fa] font-semibold"
                    >
                      이메일 로그 전체 보기 →
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col min-h-0">
          {currentPage === 'dashboard' && <Dashboard />}
          {currentPage === 'pipeline' && <Pipeline />}
          {currentPage === 'buyers' && <Buyers key={buyersRefreshKey} />}
          {currentPage === 'emails' && <Emails />}
          {currentPage === 'kpi' && <KPIReport />}
          {currentPage === 'domain' && <Domain />}
        </div>

        {/* Modals */}
        <PipelineRunModal
          isOpen={pipelineModalOpen}
          onClose={() => {
            setPipelineModalOpen(false);
            setCurrentPage('pipeline');
          }}
        />
        <CSVUploadModal
          isOpen={csvUploadModalOpen}
          onClose={() => setCsvUploadModalOpen(false)}
          onImport={handleCSVImport}
        />
      </main>
    </div>
  );
}
