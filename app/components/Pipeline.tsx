'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase, startPipeline } from '../lib/supabase';
import type { PipelineJob, PipelineLog } from '../lib/types';

const PIPELINE_STEPS = [
  { key: 'A', icon: '🔍', name: '직원 A — 바이어 발굴', desc: 'Clay API 기반 신규 바이어 발굴 및 담당자 탐색' },
  { key: 'B', icon: '✉️', name: '직원 B — 이메일 검증', desc: 'ZeroBounce API 이메일 유효성 검증' },
  { key: 'C', icon: '📊', name: '직원 C — 기업 분석', desc: 'Claude API 기업 분석 및 K-beauty 매칭' },
  { key: 'D', icon: '✍️', name: '직원 D — 이메일 초안', desc: 'Claude API 개인화 이메일 초안 생성' },
  { key: 'E', icon: '🛡️', name: '직원 E — 스팸 테스트', desc: 'Claude API 규칙 기반 스팸 검사 및 자동 수정' },
  { key: 'F', icon: '📋', name: '직원 F — 시스템 모니터링', desc: 'API 상태 체크 및 경고' },
];

type StepStatus = 'pending' | 'running' | 'done' | 'error' | 'waiting';

export default function Pipeline() {
  const [activeJob, setActiveJob] = useState<PipelineJob | null>(null);
  const [jobLogs, setJobLogs] = useState<PipelineLog[]>([]);
  const [stepStatuses, setStepStatuses] = useState<Record<string, StepStatus>>({});
  const [isStarting, setIsStarting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<'GCC' | 'USA' | 'Europe'>('GCC');
  const [recentJobs, setRecentJobs] = useState<PipelineJob[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);

  // 최근 job 목록 로드
  const loadRecentJobs = useCallback(async () => {
    const { data } = await supabase
      .from('pipeline_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
    if (data) setRecentJobs(data);
  }, []);

  // 활성 job 확인 (running 상태)
  const checkActiveJob = useCallback(async () => {
    const { data } = await supabase
      .from('pipeline_jobs')
      .select('*')
      .eq('status', 'running')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (data) {
      setActiveJob(data);
      return data;
    }

    // pending도 체크
    const { data: pending } = await supabase
      .from('pipeline_jobs')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (pending) {
      setActiveJob(pending);
      return pending;
    }

    setActiveJob(null);
    return null;
  }, []);

  // job 로그 로드
  const loadJobLogs = useCallback(async (jobId: string) => {
    const { data } = await supabase
      .from('pipeline_logs')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: true });

    if (data) {
      setJobLogs(data);

      // 로그 기반으로 step 상태 업데이트
      const statuses: Record<string, StepStatus> = {};
      for (const log of data) {
        if (log.status === 'completed') statuses[log.agent] = 'done';
        else if (log.status === 'failed') statuses[log.agent] = 'error';
        else if (log.status === 'running') statuses[log.agent] = 'running';
      }
      setStepStatuses(statuses);

      // 경고 추출 (직원 F 로그에서)
      const fLog = data.find((l: PipelineLog) => l.agent === 'F' && l.status === 'completed');
      if (fLog && fLog.message.includes('경고')) {
        const warningParts = fLog.message.split(': ').slice(1).join(': ').split(' | ');
        setWarnings(warningParts);
      } else {
        setWarnings([]);
      }
    }
  }, []);

  // 초기 로드
  useEffect(() => {
    loadRecentJobs();
    checkActiveJob();
  }, [loadRecentJobs, checkActiveJob]);

  // 활성 job 폴링 (5초마다)
  useEffect(() => {
    if (!activeJob || (activeJob.status !== 'running' && activeJob.status !== 'pending')) return;

    const interval = setInterval(async () => {
      // job 상태 새로고침
      const { data: updatedJob } = await supabase
        .from('pipeline_jobs')
        .select('*')
        .eq('id', activeJob.id)
        .single();

      if (updatedJob) {
        setActiveJob(updatedJob);
        await loadJobLogs(updatedJob.id);

        // 완료/실패 시 폴링 중지
        if (updatedJob.status === 'completed' || updatedJob.status === 'failed') {
          loadRecentJobs();
        }
      }
    }, 5000);

    // 즉시 로그 로드
    loadJobLogs(activeJob.id);

    return () => clearInterval(interval);
  }, [activeJob?.id, activeJob?.status, loadJobLogs, loadRecentJobs]);

  // 파이프라인 시작
  async function handleStartPipeline() {
    setIsStarting(true);
    setSuccessMessage(null);
    setStepStatuses({});
    setJobLogs([]);
    setWarnings([]);

    try {
      const result = await startPipeline(selectedTeam);
      setSuccessMessage(result.message);

      // 새 job 로드
      const { data: newJob } = await supabase
        .from('pipeline_jobs')
        .select('*')
        .eq('id', result.jobId)
        .single();

      if (newJob) {
        setActiveJob(newJob);

        // 초기 상태: 모든 step을 waiting으로
        const initial: Record<string, StepStatus> = {};
        PIPELINE_STEPS.forEach((s) => (initial[s.key] = 'waiting'));
        setStepStatuses(initial);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '파이프라인 시작 실패';
      setSuccessMessage(`오류: ${msg}`);
    } finally {
      setIsStarting(false);
    }
  }

  // 과거 job 상세 보기
  async function handleViewJob(job: PipelineJob) {
    setActiveJob(job);
    await loadJobLogs(job.id);
  }

  const getStepDisplay = (key: string) => {
    const status = stepStatuses[key];
    const currentAgent = activeJob?.current_agent;

    // 현재 실행 중인 agent 감지
    if (currentAgent === key && activeJob?.status === 'running') {
      return { color: 'bg-[#f59e0b]', text: 'text-[#f59e0b]', label: '실행 중', pulse: true };
    }

    if (!status || status === 'waiting') return { color: 'bg-[#334155]', text: 'text-[#64748b]', label: '대기', pulse: false };
    if (status === 'pending') return { color: 'bg-[#334155]', text: 'text-[#64748b]', label: '대기', pulse: false };
    if (status === 'running') return { color: 'bg-[#f59e0b]', text: 'text-[#f59e0b]', label: '실행 중', pulse: true };
    if (status === 'done') return { color: 'bg-[#22c55e]', text: 'text-[#22c55e]', label: '완료', pulse: false };
    return { color: 'bg-[#ef4444]', text: 'text-[#ef4444]', label: '오류', pulse: false };
  };

  const isRunning = activeJob?.status === 'running' || activeJob?.status === 'pending';

  return (
    <div className="flex-1 overflow-y-auto h-full">
      <div className="p-6 space-y-6">

        {/* 성공 메시지 배너 */}
        {successMessage && (
          <div className={`p-4 rounded-lg border text-sm font-semibold ${
            successMessage.startsWith('오류')
              ? 'bg-[#ef4444]/10 border-[#ef4444]/30 text-[#ef4444]'
              : 'bg-[#22c55e]/10 border-[#22c55e]/30 text-[#22c55e]'
          }`}>
            {successMessage}
          </div>
        )}

        {/* 경고 배너 (직원 F) */}
        {warnings.length > 0 && (
          <div className="p-4 rounded-lg border bg-[#f59e0b]/10 border-[#f59e0b]/30">
            <div className="text-sm font-semibold text-[#f59e0b] mb-2">⚠️ 시스템 경고</div>
            {warnings.map((w, i) => (
              <div key={i} className="text-xs text-[#fbbf24] mt-1">• {w}</div>
            ))}
          </div>
        )}

        {/* Header Card */}
        <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-5">
          <div className="flex items-start justify-between mb-5">
            <div>
              <div className="text-sm font-semibold text-[#f1f5f9]">백그라운드 파이프라인 — Supabase Edge Function</div>
              <div className="text-xs text-[#64748b] mt-1">
                {isRunning
                  ? `실행 중 (${activeJob?.team}팀) — 브라우저를 닫으셔도 됩니다`
                  : activeJob?.status === 'completed'
                    ? `마지막 완료: ${activeJob.completed_at ? new Date(activeJob.completed_at).toLocaleString('ko-KR') : ''}`
                    : '팀을 선택하고 파이프라인을 실행하세요'
                }
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* 팀 선택 */}
              <select
                value={selectedTeam}
                onChange={(e) => setSelectedTeam(e.target.value as 'GCC' | 'USA' | 'Europe')}
                disabled={isRunning || isStarting}
                className="bg-[#0f172a] border border-[#334155] rounded-lg px-3 py-2 text-sm text-[#f1f5f9] disabled:opacity-50"
              >
                <option value="GCC">🇸🇦 GCC</option>
                <option value="USA">🇺🇸 USA</option>
                <option value="Europe">🇬🇧 Europe</option>
              </select>

              {activeJob?.status === 'completed' && (
                <span className="bg-[#22c55e]/20 text-[#22c55e] text-xs px-2 py-1 rounded font-semibold">
                  ✓ 완료
                </span>
              )}
              {activeJob?.status === 'failed' && (
                <span className="bg-[#ef4444]/20 text-[#ef4444] text-xs px-2 py-1 rounded font-semibold">
                  ✕ 실패
                </span>
              )}

              <button
                onClick={handleStartPipeline}
                disabled={isRunning || isStarting}
                className="px-5 py-2 bg-[#3b82f6] rounded-lg text-white text-sm font-semibold hover:bg-[#2563eb] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isStarting ? (
                  <>
                    <span className="animate-spin inline-block">⟳</span>
                    시작 중...
                  </>
                ) : isRunning ? (
                  <>
                    <span className="animate-spin inline-block">⟳</span>
                    실행 중...
                  </>
                ) : (
                  '▶ 파이프라인 실행'
                )}
              </button>
            </div>
          </div>

          {/* Pipeline Steps */}
          <div className="space-y-3">
            {PIPELINE_STEPS.map((step, idx) => {
              const display = getStepDisplay(step.key);
              const status = stepStatuses[step.key];
              const agentLog = jobLogs.find((l) => l.agent === step.key && l.status !== 'running');

              return (
                <div key={step.key} className="flex items-center gap-4 p-3 bg-[#0f172a] rounded-lg border border-[#334155]">
                  {/* Step icon */}
                  <div className={`w-8 h-8 rounded-full ${display.color} flex items-center justify-center text-white font-bold text-sm flex-shrink-0 transition-all ${display.pulse ? 'animate-pulse' : ''}`}>
                    {status === 'done' ? '✓' : status === 'running' || activeJob?.current_agent === step.key ? '⟳' : status === 'error' ? '✕' : String.fromCharCode(65 + idx)}
                  </div>

                  {/* Step info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-[#f1f5f9]">
                      {step.icon} {step.name}
                    </div>
                    <div className="text-xs text-[#64748b] mt-0.5">{step.desc}</div>
                    {/* 로그 메시지 표시 */}
                    {agentLog && (
                      <div className={`text-xs mt-1 ${
                        agentLog.status === 'completed' ? 'text-[#22c55e]' :
                        agentLog.status === 'failed' ? 'text-[#ef4444]' : 'text-[#94a3b8]'
                      }`}>
                        {agentLog.message}
                      </div>
                    )}
                  </div>

                  {/* Credits/Cost */}
                  <div className="text-right flex-shrink-0">
                    {agentLog && agentLog.credits_used > 0 && (
                      <div className="text-xs text-[#94a3b8]">
                        크레딧: {agentLog.credits_used}
                      </div>
                    )}
                    {agentLog && agentLog.api_cost_usd > 0 && (
                      <div className="text-xs text-[#94a3b8]">
                        ${agentLog.api_cost_usd.toFixed(4)}
                      </div>
                    )}
                    <div className={`text-xs font-semibold ${display.text} mt-0.5`}>
                      {display.label}
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="w-24 h-1.5 bg-[#334155] rounded-full overflow-hidden flex-shrink-0">
                    <div
                      className={`h-full transition-all duration-500 ${
                        status === 'done' ? 'w-full bg-[#22c55e]' :
                        status === 'running' || activeJob?.current_agent === step.key ? 'w-1/2 bg-[#f59e0b] animate-pulse' :
                        status === 'error' ? 'w-full bg-[#ef4444]' : 'w-0'
                      }`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 실행 로그 + 최근 실행 기록 */}
        <div className="grid grid-cols-2 gap-4">
          {/* 실시간 로그 */}
          <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-5">
            <div className="text-sm font-semibold text-[#f1f5f9] mb-3">
              실시간 로그 {activeJob && <span className="text-xs text-[#64748b] font-normal ml-2">Job: {activeJob.id.slice(0, 8)}...</span>}
            </div>
            <div className="space-y-1 max-h-[300px] overflow-y-auto">
              {jobLogs.length === 0 ? (
                <div className="text-xs text-[#475569] p-3 text-center">
                  파이프라인을 실행하면 로그가 표시됩니다
                </div>
              ) : (
                jobLogs.map((log, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-2 bg-[#0f172a] rounded border border-[#334155]">
                    <span className="text-xs text-[#475569] whitespace-nowrap flex-shrink-0">
                      {new Date(log.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-semibold flex-shrink-0 ${
                      log.agent === 'A' ? 'bg-[#3b82f6]/20 text-[#3b82f6]' :
                      log.agent === 'B' ? 'bg-[#8b5cf6]/20 text-[#8b5cf6]' :
                      log.agent === 'C' ? 'bg-[#f59e0b]/20 text-[#f59e0b]' :
                      log.agent === 'D' ? 'bg-[#22c55e]/20 text-[#22c55e]' :
                      log.agent === 'E' ? 'bg-[#ef4444]/20 text-[#ef4444]' :
                      'bg-[#64748b]/20 text-[#64748b]'
                    }`}>
                      {log.agent}
                    </span>
                    <span className={`text-xs flex-1 ${
                      log.status === 'completed' ? 'text-[#22c55e]' :
                      log.status === 'failed' ? 'text-[#ef4444]' :
                      'text-[#94a3b8]'
                    }`}>{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 최근 실행 기록 */}
          <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-5">
            <div className="text-sm font-semibold text-[#f1f5f9] mb-3">최근 실행 기록</div>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {recentJobs.length === 0 ? (
                <div className="text-xs text-[#475569] p-3 text-center">
                  아직 실행 기록이 없습니다
                </div>
              ) : (
                recentJobs.map((job) => (
                  <button
                    key={job.id}
                    onClick={() => handleViewJob(job)}
                    className={`w-full flex items-center justify-between p-3 rounded-lg border transition hover:bg-[#0f172a] ${
                      activeJob?.id === job.id ? 'bg-[#0f172a] border-[#3b82f6]' : 'bg-[#0f172a]/50 border-[#334155]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`w-2 h-2 rounded-full ${
                        job.status === 'completed' ? 'bg-[#22c55e]' :
                        job.status === 'running' ? 'bg-[#f59e0b] animate-pulse' :
                        job.status === 'failed' ? 'bg-[#ef4444]' :
                        'bg-[#64748b]'
                      }`} />
                      <div className="text-left">
                        <div className="text-xs font-semibold text-[#f1f5f9]">
                          {job.team} 팀
                        </div>
                        <div className="text-xs text-[#64748b]">
                          {new Date(job.created_at).toLocaleString('ko-KR', {
                            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                          })}
                        </div>
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded font-semibold ${
                      job.status === 'completed' ? 'bg-[#22c55e]/20 text-[#22c55e]' :
                      job.status === 'running' ? 'bg-[#f59e0b]/20 text-[#f59e0b]' :
                      job.status === 'failed' ? 'bg-[#ef4444]/20 text-[#ef4444]' :
                      'bg-[#64748b]/20 text-[#64748b]'
                    }`}>
                      {job.status === 'completed' ? '완료' :
                       job.status === 'running' ? '실행 중' :
                       job.status === 'failed' ? '실패' : '대기'}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
