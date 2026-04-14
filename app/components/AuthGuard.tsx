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
      <div className="flex items-center justify-center min-h-screen bg-[#f8f9fa]">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-[#e9ecef] p-10 mx-4">
          {/* 잠금 배지 */}
          <div className="flex justify-center mb-6">
            <div className="inline-flex items-center gap-2 bg-[#f0f0ff] text-[#635BFF] text-sm font-medium px-4 py-2 rounded-full">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
              팀 전용 플랫폼
            </div>
          </div>

          {/* 타이틀 */}
          <h1 className="text-2xl font-bold text-[#1a1f36] text-center mb-3">
            Buyer Searching Platform
          </h1>

          {/* 설명 */}
          <p className="text-[#697386] text-sm text-center mb-8 leading-relaxed">
            본 플랫폼은 SPS International 팀만 이용 가능합니다.<br />
            등록된 Google 계정으로 로그인해 주세요.
          </p>

          {/* Google 로그인 버튼 */}
          <button
            onClick={handleGoogleLogin}
            className="flex items-center justify-center gap-3 w-full px-6 py-3.5 bg-[#635BFF] text-white rounded-xl font-semibold hover:bg-[#5851DB] transition text-sm"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fillOpacity=".8"/>
              <path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fillOpacity=".8"/>
              <path fill="#fff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fillOpacity=".8"/>
              <path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fillOpacity=".8"/>
            </svg>
            Google 계정으로 로그인
          </button>

          <p className="text-xs text-[#8792a2] mt-4 text-center">
            @spscos.com 계정만 접근 가능합니다
          </p>

          {/* 하단 서명 */}
          <div className="mt-8 pt-6 border-t border-[#e9ecef] text-center">
            <span className="text-xs text-[#8792a2]">by SPSCOS</span>
          </div>
        </div>
      </div>
    );
  }

  // 도메인 검증 — @spscos.com 만 허용
  const email = user.email || '';
  if (!email.endsWith('@spscos.com')) {
    return (
      <div className="flex items-center justify-center h-screen bg-white">
        <div className="w-full max-w-sm px-8 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-[#ef4444] rounded-xl mb-4">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <div className="text-lg font-bold text-[#1a1f36] mb-2">접근 권한 없음</div>
          <p className="text-sm text-[#697386] mb-6">
            <strong>@spscos.com</strong> 계정만 접근 가능합니다.<br />
            현재 로그인: {email}
          </p>
          <button
            onClick={async () => { await supabase.auth.signOut(); setUser(null); }}
            className="px-6 py-2.5 bg-[#635BFF] text-white rounded-lg text-sm font-medium hover:bg-[#5851DB] transition"
          >
            다른 계정으로 로그인
          </button>
        </div>
      </div>
    );
  }

  // 로그인 완료 → 자녀 컴포넌트 렌더링
  return <>{children}</>;
}

// 로그아웃 함수 export (Sidebar 등에서 사용)
export async function signOut() {
  await supabase.auth.signOut();
}
