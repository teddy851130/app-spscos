'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface SidebarProps {
  currentPage: string;
  setCurrentPage: (page: string) => void;
}

export default function Sidebar({ currentPage, setCurrentPage }: SidebarProps) {
  const [draftCount, setDraftCount] = useState(0);

  useEffect(() => {
    async function loadCount() {
      // 이메일 로그 = 발송 완료된 이메일 수 (is_sent=true)
      // 배지 렌더는 이미 badgeCount > 0 조건이라 0이면 자동 숨김 (Sidebar.tsx:74)
      const { count } = await supabase
        .from('email_drafts')
        .select('id', { count: 'exact', head: true })
        .eq('is_sent', true);
      setDraftCount(count || 0);
    }
    loadCount();
    // 30초마다 갱신
    const interval = setInterval(loadCount, 30000);
    return () => clearInterval(interval);
  }, []);

  const navItems = [
    { id: 'dashboard', label: '대시보드', icon: '📊' },
    { id: 'mailQueue', label: '오늘 보낼 메일', icon: '📬' },
    { id: 'pipeline', label: '파이프라인', icon: '⚡', hasDot: true },
    { id: 'buyers', label: '바이어 DB', icon: '🏢' },
    { id: 'emails', label: '이메일 로그', icon: '📧', badgeCount: draftCount },
    { id: 'kpi', label: 'KPI 리포트', icon: '📈' },
    { id: 'domain', label: '도메인 상태', icon: '🛡️' },
  ];

  const sections = [
    { title: '메인', items: navItems.slice(0, 3) },
    { title: '바이어 관리', items: navItems.slice(3, 5) },
    { title: '모니터링', items: navItems.slice(5) },
  ];

  return (
    <div className="w-[220px] bg-[#1e293b] border-r border-[#334155] flex flex-col h-screen">
      {/* Logo */}
      <div className="p-6 border-b border-[#334155]">
        <div className="font-bold text-base text-[#f1f5f9]">SPS International</div>
        <div className="text-xs text-[#94a3b8] mt-1">Buyer Platform v1.0</div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-4 space-y-4">
        {sections.map((section) => (
          <div key={section.title}>
            <div className="text-xs font-semibold text-[#64748b] uppercase px-3 mb-2">
              {section.title}
            </div>
            <div className="space-y-1">
              {section.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setCurrentPage(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                    currentPage === item.id
                      ? 'bg-[#334155] text-[#60a5fa]'
                      : 'text-[#94a3b8] hover:bg-[#334155]/50 hover:text-[#e2e8f0]'
                  }`}
                >
                  <span className="text-base">{item.icon}</span>
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.hasDot && (
                    <div className="w-2 h-2 bg-[#ef4444] rounded-full"></div>
                  )}
                  {item.badgeCount !== undefined && item.badgeCount > 0 && (
                    <span className="bg-[#ef4444] text-white text-xs px-2 py-0.5 rounded-full">
                      {item.badgeCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* User Info */}
      <div className="border-t border-[#334155] p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#3b82f6] rounded-full flex items-center justify-center font-bold text-white">
            신
          </div>
          <div className="text-sm">
            <div className="font-semibold text-[#f1f5f9]">신동환 CEO</div>
            <div className="text-xs text-[#94a3b8]">teddy@spscos.com</div>
          </div>
        </div>
      </div>
    </div>
  );
}
