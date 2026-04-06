'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const initialPipelineStages = [
  {
    name: 'Employee A: 바이어 발굴',
    status: 'completed',
    count: 45,
    time: '2:34 AM',
  },
  {
    name: 'Employee B: 이메일 검증',
    status: 'completed',
    count: 44,
    time: '2:42 AM',
  },
  {
    name: 'Employee C: 이메일 작성',
    status: 'in_progress',
    count: 38,
    time: '진행 중...',
  },
  {
    name: 'Employee D: 스팸 테스트',
    status: 'pending',
    count: 0,
    time: '대기 중',
  },
  {
    name: 'Employee E: 발송 + 기록',
    status: 'pending',
    count: 0,
    time: '대기 중',
  },
];

const recentLogs = [
  { msg: 'Basharacare.com (Maya Berberi) - 이메일 작성 완료', time: '2:48 AM', status: 'success' },
  { msg: 'Namshi.com 유효성 검사 실패 - 이메일 재확인 필요', time: '2:46 AM', status: 'warning' },
  { msg: 'Ounass.ae - 이메일 작성 완료', time: '2:45 AM', status: 'success' },
  { msg: 'Noon.com 유효성 검사 통과', time: '2:44 AM', status: 'success' },
];

export default function Pipeline() {
  const [pipelineStages, setPipelineStages] = useState(initialPipelineStages);
  const [isRunning, setIsRunning] = useState(false);
  const [currentStage, setCurrentStage] = useState(0);

  async function handleRunPipeline() {
    setIsRunning(true);
    setPipelineStages(
      initialPipelineStages.map((s) => ({
        ...s,
        status: 'pending',
        time: '대기 중',
        count: 0,
      }))
    );
    setCurrentStage(0);

    // Simulate pipeline stages
    for (let i = 0; i < initialPipelineStages.length; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      setPipelineStages((prev) =>
        prev.map((stage, idx) => {
          if (idx < i) {
            return { ...stage, status: 'completed', time: new Date().toLocaleTimeString() };
          } else if (idx === i) {
            return { ...stage, status: 'in_progress', time: '진행 중...', count: 15 + idx * 5 };
          }
          return stage;
        })
      );
      setCurrentStage(i + 1);
    }

    // Mark all as completed
    await new Promise((resolve) => setTimeout(resolve, 500));
    setPipelineStages((prev) =>
      prev.map((stage) => ({
        ...stage,
        status: 'completed',
        time: new Date().toLocaleTimeString(),
      }))
    );

    // Save to Supabase
    try {
      await supabase.from('pipeline_runs').insert([
        {
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          stage_a_count: 45,
          stage_b_count: 44,
          stage_c_count: 38,
          stage_d_count: 38,
          stage_e_count: 38,
        },
      ]);
    } catch (error) {
      console.warn('Pipeline save error:', error);
    }

    setIsRunning(false);
  }

  return (
    <div className="flex-1 flex flex-col overflow-auto">
      {/* Topbar */}
      <div className="sticky top-0 bg-[#0f172a] border-b border-[#334155] px-8 py-6 flex justify-between items-center z-10">
        <div>
          <h1 className="text-2xl font-bold text-[#f1f5f9]">파이프라인</h1>
          <p className="text-sm text-[#94a3b8] mt-1">야간 파이프라인 실행 현황</p>
        </div>
        <button
          onClick={handleRunPipeline}
          disabled={isRunning}
          className="px-6 py-2 bg-[#3b82f6] rounded-lg text-white font-semibold hover:bg-[#2563eb] transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isRunning ? '⟳ 실행 중...' : '▶ 파이프라인 실행'}
        </button>
      </div>

      <div className="flex-1 overflow-auto p-8 space-y-8">
        {/* Pipeline Stages */}
        <div className="space-y-3">
          {pipelineStages.map((stage, idx) => {
            const isCompleted = stage.status === 'completed';
            const isInProgress = stage.status === 'in_progress';
            const isPending = stage.status === 'pending';

            return (
              <div key={idx} className="bg-[#1e293b] border border-[#334155] rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4 flex-1">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                        isCompleted
                          ? 'bg-[#22c55e] text-white'
                          : isInProgress
                          ? 'bg-[#f59e0b] text-white'
                          : 'bg-[#334155] text-[#64748b]'
                      }`}
                    >
                      {isCompleted ? '✓' : isInProgress ? '⟳' : '○'}
                    </div>
                    <div>
                      <div className="font-semibold text-[#f1f5f9]">{stage.name}</div>
                      <div className="text-xs text-[#94a3b8] mt-1">
                        {isCompleted || isInProgress ? `${stage.count}건 처리` : '대기 중'}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-[#e2e8f0]">{stage.count}</div>
                    <div
                      className={`text-xs mt-1 font-medium ${
                        isCompleted
                          ? 'text-[#22c55e]'
                          : isInProgress
                          ? 'text-[#f59e0b]'
                          : 'text-[#64748b]'
                      }`}
                    >
                      {stage.time}
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="h-2 bg-[#334155] rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      isCompleted ? 'bg-[#22c55e] w-full' : isInProgress ? 'bg-[#f59e0b] w-1/2' : 'bg-[#64748b] w-0'
                    }`}
                  ></div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Pipeline Diagram */}
        <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-6">
          <div className="text-sm font-semibold text-[#f1f5f9] mb-4">파이프라인 흐름도</div>
          <div className="flex items-center justify-between text-center text-xs">
            <div className="flex-1">
              <div className="w-12 h-12 bg-[#22c55e] rounded-lg flex items-center justify-center text-white font-bold mx-auto mb-2">
                A
              </div>
              <div className="text-[#f1f5f9] font-semibold">바이어</div>
              <div className="text-[#94a3b8]">발굴</div>
            </div>
            <div className="text-[#3b82f6] font-bold mb-4">→</div>
            <div className="flex-1">
              <div className="w-12 h-12 bg-[#22c55e] rounded-lg flex items-center justify-center text-white font-bold mx-auto mb-2">
                B
              </div>
              <div className="text-[#f1f5f9] font-semibold">이메일</div>
              <div className="text-[#94a3b8]">검증</div>
            </div>
            <div className="text-[#3b82f6] font-bold mb-4">→</div>
            <div className="flex-1">
              <div className="w-12 h-12 bg-[#f59e0b] rounded-lg flex items-center justify-center text-white font-bold mx-auto mb-2">
                C
              </div>
              <div className="text-[#f1f5f9] font-semibold">이메일</div>
              <div className="text-[#94a3b8]">작성</div>
            </div>
            <div className="text-[#3b82f6] font-bold mb-4">→</div>
            <div className="flex-1">
              <div className="w-12 h-12 bg-[#64748b] rounded-lg flex items-center justify-center text-white font-bold mx-auto mb-2">
                D
              </div>
              <div className="text-[#f1f5f9] font-semibold">스팸</div>
              <div className="text-[#94a3b8]">테스트</div>
            </div>
            <div className="text-[#3b82f6] font-bold mb-4">→</div>
            <div className="flex-1">
              <div className="w-12 h-12 bg-[#64748b] rounded-lg flex items-center justify-center text-white font-bold mx-auto mb-2">
                E
              </div>
              <div className="text-[#f1f5f9] font-semibold">발송 +</div>
              <div className="text-[#94a3b8]">기록</div>
            </div>
          </div>
        </div>

        {/* Recent Logs */}
        <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-6">
          <div className="text-sm font-semibold text-[#f1f5f9] mb-4">최근 로그</div>
          <div className="space-y-2">
            {recentLogs.map((log, idx) => (
              <div key={idx} className="flex items-start gap-3 p-3 bg-[#0f172a] rounded border border-[#334155]">
                <span
                  className={`text-lg flex-shrink-0 ${
                    log.status === 'success' ? '✓' : log.status === 'warning' ? '⚠️' : '○'
                  }`}
                ></span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-[#e2e8f0]">{log.msg}</div>
                  <div className="text-xs text-[#64748b] mt-1">{log.time}</div>
                </div>
                <div
                  className={`text-xs font-semibold px-2 py-1 rounded whitespace-nowrap ${
                    log.status === 'success'
                      ? 'bg-[#22c55e]/20 text-[#22c55e]'
                      : log.status === 'warning'
                      ? 'bg-[#f59e0b]/20 text-[#f59e0b]'
                      : 'bg-[#334155] text-[#94a3b8]'
                  }`}
                >
                  {log.status === 'success' ? '성공' : log.status === 'warning' ? '경고' : '처리중'}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
