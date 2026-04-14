'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';

interface AuthGuardProps {
  children: React.ReactNode;
}

/**
 * 인증 보호 래퍼 — Google 로그인 필수
 * 로그인 안 되어 있으면 로그인 화면 표시
 * 로그인 되면 children 렌더링
 */
export default function AuthGuard({ children }: AuthGuardProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 현재 세션 확인
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // 인증 상태 변화 구독
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // spscos.com 도메인만 허용하려면 Supabase Dashboard에서 설정
        redirectTo: window.location.origin,
      },
    });
    if (error) {
      alert('로그인 실패: ' + error.message);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  // 로딩 중
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#f6f8fa]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#635BFF]" />
      </div>
    );
  }

  // 비로그인 → 로그인 화면
  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#f6f8fa]">
        <div className="bg-white border border-[#e3e8ee] rounded-2xl p-10 text-center max-w-md shadow-2xl">
          {/* 로고 */}
          <div className="mb-6">
            <div className="text-2xl font-bold text-[#1a1f36]">SPS International</div>
            <div className="text-sm text-[#697386] mt-1">Buyer Platform</div>
          </div>

          {/* 안내 */}
          <p className="text-[#697386] text-sm mb-8">
            SPS 팀 계정으로 로그인해주세요
          </p>

          {/* Google 로그인 버튼 */}
          <button
            onClick={handleGoogleLogin}
            className="flex items-center justify-center gap-3 w-full px-6 py-3 bg-white text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition shadow-sm"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Google 계정으로 로그인
          </button>

          <p className="text-xs text-[#8792a2] mt-6">
            @spscos.com 계정만 접근 가능합니다
          </p>
        </div>
      </div>
    );
  }

  // 로그인 완료 → 자녀 컴포넌트 렌더링
  // user 정보는 필요하면 Context로 전달 가능
  return <>{children}</>;
}

// 로그아웃 함수 export (Sidebar 등에서 사용)
export async function signOut() {
  await supabase.auth.signOut();
}
