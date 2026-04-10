'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { PipelineJob, PipelineLog } from '../lib/types';

const PIPELINE_STEPS = [
  { key: 'B', icon: '✉️', name: '직원 B — 이메일 검증', desc: 'ZeroBounce API 이메일 유효성 검증' },
  { key: 'C', icon: '📊', name: '직원 C — 기업 분석', desc: 'Claude API 기업 분석 및 K-beauty 매칭' },
  { key: 'D', icon: '✍️', name: '직원 D — 이메일 초안', desc: 'Claude API 개인화 이메일 초안 생성' },
  { key: 'E', icon: '🛡️', name: '직원 E — 스팸 테스트', desc: 'Claude API 규칙 기반 스팸 검사 및 자동 수정' },
  { key: 'F', icon: '📋', name: '직원 F — 시스템 모니터링', desc: 'API 상태 체크 및 경고' },
];

const TEAMS = [
  { key: 'GCC', flag: '🇸🇦', label: 'GCC' },
  { key: 'USA', flag: '🇺🇸', label: 'USA' },
  { key: 'Europe', flag: '🇬🇧', label: 'Europe' },
] as const;

const CSV_COLUMNS = [
  'company_name', 'domain', 'tier', 'annual_revenue', 'open_jobs_signal',
  'team', 'contact_name', 'contact_title', 'contact_email',
  'linkedin_url', 'icp_score',
];

type StepStatus = 'pending' | 'running' | 'done' | 'error' | 'waiting';

interface UploadResult {
  added: number;
  skipped: number;
  total: number;
  byTeam: Record<string, number>;
}

interface TeamProgress {
  buyers: number;
  validEmails: number;
  drafts: number;
}

export default function Pipeline() {
  // CSV upload state
  const [csvUploaded, setCsvUploaded] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pipeline state
  const [activeJobs, setActiveJobs] = useState<PipelineJob[]>([]);
  const [allJobLogs, setAllJobLogs] = useState<Record<string, PipelineLog[]>>({});
  const [teamStepStatuses, setTeamStepStatuses] = useState<Record<string, Record<string, StepStatus>>>({});
  const [teamProgress, setTeamProgress] = useState<Record<string, TeamProgress>>({});
  const [isStarting, setIsStarting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [recentJobs, setRecentJobs] = useState<PipelineJob[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);

  // Check if there are already uploaded buyers with no pipeline run
  useEffect(() => {
    async function checkExistingBuyers() {
      const today = new Date().toISOString().split('T')[0];
      const { count } = await supabase
        .from('buyers')
        .select('id', { count: 'exact', head: true })
        .gte('discovered_at', `${today}T00:00:00Z`);
      if (count && count > 0) setCsvUploaded(true);
    }
    checkExistingBuyers();
  }, []);

  // ─── CSV Upload ───
  function parseCSV(text: string): Record<string, string>[] {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, '').toLowerCase());
    const rows: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values: string[] = [];
      let current = '';
      let inQuotes = false;

      for (const char of lines[i]) {
        if (char === '"') { inQuotes = !inQuotes; continue; }
        if (char === ',' && !inQuotes) { values.push(current.trim()); current = ''; continue; }
        current += char;
      }
      values.push(current.trim());

      const row: Record<string, string> = {};
      headers.forEach((h, idx) => { row[h] = values[idx] || ''; });
      rows.push(row);
    }
    return rows;
  }

  async function processCSVFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setSuccessMessage('오류: CSV 파일만 업로드 가능합니다.');
      return;
    }

    setIsUploading(true);
    setUploadResult(null);
    setSuccessMessage(null);

    try {
      const text = await file.text();
      const rows = parseCSV(text);

      if (rows.length === 0) {
        setSuccessMessage('오류: CSV 파일이 비어있거나 형식이 올바르지 않습니다.');
        return;
      }

      // 기존 도메인 조회 (중복 체크)
      const { data: existingBuyers } = await supabase
        .from('buyers').select('domain').not('domain', 'is', null);
      const existingDomains = new Set(
        (existingBuyers || []).map((b: { domain: string }) => b.domain?.toLowerCase())
      );

      let added = 0;
      let skipped = 0;
      const byTeam: Record<string, number> = { GCC: 0, USA: 0, Europe: 0 };

      for (const row of rows) {
        const domain = (row.domain || '').toLowerCase().trim();
        if (!domain || !row.company_name) { skipped++; continue; }
        if (existingDomains.has(domain)) { skipped++; continue; }

        const team = row.team || 'GCC';
        const tier = row.tier || 'Tier2';
        const annualRevenue = parseFloat(row.annual_revenue) || 0;

        // buyers INSERT (recent_news는 직원 C가 자동 채움)
        const { data: newBuyer } = await supabase.from('buyers').insert({
          company_name: row.company_name,
          domain,
          website: `https://${domain}`,
          region: team,
          team,
          tier,
          annual_revenue: annualRevenue,
          open_jobs_signal: row.open_jobs_signal === 'true' || row.open_jobs_signal === '1',
          status: 'Cold',
          k_beauty_flag: 'Unknown',
          is_blacklisted: false,
        }).select('id').single();

        if (!newBuyer) { skipped++; continue; }

        // buyer_contacts INSERT (if contact data exists)
        if (row.contact_name && row.contact_email) {
          await supabase.from('buyer_contacts').insert({
            buyer_id: newBuyer.id,
            contact_name: row.contact_name,
            contact_title: row.contact_title || '',
            contact_email: row.contact_email,
            linkedin_url: row.linkedin_url || '',
            is_primary: true,
            source: 'csv',
          });
        }

        existingDomains.add(domain);
        added++;
        byTeam[team] = (byTeam[team] || 0) + 1;
      }

      setUploadResult({ added, skipped, total: rows.length, byTeam });
      setCsvUploaded(added > 0);
      if (added > 0) {
        setSuccessMessage(`CSV 업로드 완료: ${added}개 기업 추가, ${skipped}개 건너뜀`);
      } else {
        setSuccessMessage(`CSV 업로드: 새로운 기업이 없습니다 (${skipped}개 모두 중복)`);
      }
    } catch (err) {
      setSuccessMessage(`CSV 오류: ${err instanceof Error ? err.message : '파일을 읽을 수 없습니다'}`);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processCSVFile(file);
  }

  // 드래그 카운터 (자식 요소 진입/이탈 시 깜박임 방지)
  const dragCounter = useRef(0);

  function handleDragEnter(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;
    if (isUploading) return;
    const file = e.dataTransfer.files?.[0];
    if (file) processCSVFile(file);
  }

  // ─── Pipeline Execution (3 teams parallel) ───
  const loadRecentJobs = useCallback(async () => {
    const { data } = await supabase
      .from('pipeline_jobs').select('*')
      .order('created_at', { ascending: false }).limit(15);
    if (data) setRecentJobs(data);
  }, []);

  useEffect(() => { loadRecentJobs(); }, [loadRecentJobs]);

  // Load team progress from DB
  const loadTeamProgress = useCallback(async () => {
    const progress: Record<string, TeamProgress> = {};
    for (const t of TEAMS) {
      const { count: buyers } = await supabase
        .from('buyers').select('id', { count: 'exact', head: true }).eq('team', t.key);
      const { count: validEmails } = await supabase
        .from('buyer_contacts').select('id', { count: 'exact', head: true })
        .in('email_status', ['valid', 'catch-all-pass']);
      const { count: drafts } = await supabase
        .from('email_drafts').select('id', { count: 'exact', head: true })
        .not('body_first', 'eq', '');
      progress[t.key] = { buyers: buyers || 0, validEmails: validEmails || 0, drafts: drafts || 0 };
    }
    setTeamProgress(progress);
  }, []);

  // Poll active jobs
  useEffect(() => {
    if (activeJobs.length === 0) return;
    const anyRunning = activeJobs.some((j) => j.status === 'running' || j.status === 'pending');
    if (!anyRunning) return;

    const interval = setInterval(async () => {
      const jobIds = activeJobs.map((j) => j.id);
      const { data: updated } = await supabase
        .from('pipeline_jobs').select('*').in('id', jobIds);

      if (updated) {
        setActiveJobs(updated);

        // Load logs for each job
        const logsMap: Record<string, PipelineLog[]> = {};
        const statusMap: Record<string, Record<string, StepStatus>> = {};

        for (const job of updated) {
          const { data: logs } = await supabase
            .from('pipeline_logs').select('*').eq('job_id', job.id)
            .order('created_at', { ascending: true });

          logsMap[job.team] = logs || [];
          const statuses: Record<string, StepStatus> = {};
          for (const log of (logs || [])) {
            if (log.status === 'completed') statuses[log.agent] = 'done';
            else if (log.status === 'failed') statuses[log.agent] = 'error';
            else if (log.status === 'running') statuses[log.agent] = 'running';
          }
          statusMap[job.team] = statuses;

          // Extract warnings from agent F
          const fLog = (logs || []).find((l: PipelineLog) => l.agent === 'F' && l.status === 'completed');
          if (fLog && fLog.message.includes('경고')) {
            setWarnings(fLog.message.split(': ').slice(1).join(': ').split(' | '));
          }
        }

        setAllJobLogs(logsMap);
        setTeamStepStatuses(statusMap);

        // If all completed, refresh
        if (updated.every((j) => j.status === 'completed' || j.status === 'failed')) {
          loadRecentJobs();
          loadTeamProgress();
        }
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [activeJobs, loadRecentJobs, loadTeamProgress]);

  async function handleStartPipeline() {
    setIsStarting(true);
    setSuccessMessage(null);
    setWarnings([]);
    setTeamStepStatuses({});
    setAllJobLogs({});

    try {
      const jobs: PipelineJob[] = [];

      // 3개 팀 동시에 pipeline_jobs INSERT + Edge Function 호출
      for (const t of TEAMS) {
        const { data: job } = await supabase
          .from('pipeline_jobs')
          .insert({ team: t.key, status: 'pending' })
          .select('*').single();

        if (job) {
          jobs.push(job);
          // Edge Function 트리거
          supabase.functions.invoke('run-pipeline', { body: { jobId: job.id } }).catch(() => {});
        }
      }

      setActiveJobs(jobs);
      setSuccessMessage('파이프라인이 시작되었습니다. 브라우저를 닫으셔도 됩니다. (GCC + USA + Europe 동시 실행)');

      // 초기 상태
      const initial: Record<string, Record<string, StepStatus>> = {};
      for (const t of TEAMS) {
        initial[t.key] = {};
        PIPELINE_STEPS.forEach((s) => { initial[t.key][s.key] = 'waiting'; });
      }
      setTeamStepStatuses(initial);
    } catch (err) {
      setSuccessMessage(`오류: ${err instanceof Error ? err.message : '파이프라인 시작 실패'}`);
    } finally {
      setIsStarting(false);
    }
  }

  const getStepDisplay = (team: string, key: string, currentAgent?: string | null, jobStatus?: string) => {
    const status = teamStepStatuses[team]?.[key];
    if (currentAgent === key && jobStatus === 'running') {
      return { color: 'bg-[#f59e0b]', text: 'text-[#f59e0b]', label: '실행 중', pulse: true };
    }
    if (!status || status === 'waiting') return { color: 'bg-[#334155]', text: 'text-[#64748b]', label: '대기', pulse: false };
    if (status === 'running') return { color: 'bg-[#f59e0b]', text: 'text-[#f59e0b]', label: '실행 중', pulse: true };
    if (status === 'done') return { color: 'bg-[#22c55e]', text: 'text-[#22c55e]', label: '완료', pulse: false };
    return { color: 'bg-[#ef4444]', text: 'text-[#ef4444]', label: '오류', pulse: false };
  };

  const isRunning = activeJobs.some((j) => j.status === 'running' || j.status === 'pending');

  // Overall progress
  const totalSteps = TEAMS.length * PIPELINE_STEPS.length;
  let completedSteps = 0;
  for (const t of TEAMS) {
    for (const s of PIPELINE_STEPS) {
      if (teamStepStatuses[t.key]?.[s.key] === 'done') completedSteps++;
    }
  }
  const overallProgress = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  return (
    <div className="flex-1 overflow-y-auto h-full">
      <div className="p-6 space-y-6">

        {/* 메시지 배너 */}
        {successMessage && (
          <div className={`p-4 rounded-lg border text-sm font-semibold ${
            successMessage.startsWith('오류') || successMessage.startsWith('CSV 오류')
              ? 'bg-[#ef4444]/10 border-[#ef4444]/30 text-[#ef4444]'
              : 'bg-[#22c55e]/10 border-[#22c55e]/30 text-[#22c55e]'
          }`}>
            {successMessage}
          </div>
        )}

        {/* 경고 배너 */}
        {warnings.length > 0 && (
          <div className="p-4 rounded-lg border bg-[#f59e0b]/10 border-[#f59e0b]/30">
            <div className="text-sm font-semibold text-[#f59e0b] mb-2">⚠️ 시스템 경고</div>
            {warnings.map((w, i) => (
              <div key={i} className="text-xs text-[#fbbf24] mt-1">• {w}</div>
            ))}
          </div>
        )}

        {/* ─── Header: CSV Upload + Pipeline Run ─── */}
        <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-sm font-semibold text-[#f1f5f9]">파이프라인 — CSV 업로드 → B→C→D→E→F 자동 실행</div>
              <div className="text-xs text-[#64748b] mt-1">
                {isRunning
                  ? 'GCC + USA + Europe 3개 팀 동시 실행 중 — 브라우저를 닫으셔도 됩니다'
                  : csvUploaded
                    ? 'CSV 업로드 완료. 파이프라인을 실행하세요.'
                    : 'CSV 파일을 업로드하면 파이프라인 실행 버튼이 활성화됩니다.'
                }
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* CSV Upload */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileInputChange}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || isRunning}
                className="px-4 py-2 bg-[#334155] border border-[#475569] rounded-lg text-white text-sm font-semibold hover:bg-[#475569] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isUploading ? (
                  <><span className="animate-spin inline-block">⟳</span> 업로드 중...</>
                ) : (
                  '📄 CSV 업로드'
                )}
              </button>

              {/* Pipeline Run */}
              <button
                onClick={handleStartPipeline}
                disabled={!csvUploaded || isRunning || isStarting}
                className="px-5 py-2 bg-[#3b82f6] rounded-lg text-white text-sm font-semibold hover:bg-[#2563eb] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isStarting ? (
                  <><span className="animate-spin inline-block">⟳</span> 시작 중...</>
                ) : isRunning ? (
                  <><span className="animate-spin inline-block">⟳</span> 실행 중...</>
                ) : (
                  '▶ 파이프라인 실행'
                )}
              </button>
            </div>
          </div>

          {/* CSV Drag & Drop Zone (항상 표시) */}
          {!isRunning && (
            <div
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => !isUploading && fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-6 mb-4 text-center cursor-pointer transition-all select-none ${
                isDragging
                  ? 'border-[#3b82f6] bg-[#3b82f6]/15 scale-[1.01] shadow-lg shadow-[#3b82f6]/20'
                  : 'border-[#475569] bg-[#0f172a] hover:border-[#3b82f6]/60 hover:bg-[#0f172a]/80'
              } ${isUploading ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
            >
              <div className="text-4xl mb-2 pointer-events-none">{isDragging ? '⬇️' : '📄'}</div>
              <div className={`text-sm font-semibold mb-1 pointer-events-none ${isDragging ? 'text-[#3b82f6]' : 'text-[#f1f5f9]'}`}>
                {isUploading
                  ? '업로드 중...'
                  : isDragging
                    ? '여기에 CSV 파일을 놓으세요'
                    : '여기에 CSV 파일을 드래그하거나 클릭해서 업로드'}
              </div>
              <div className="text-xs text-[#64748b] mb-3 pointer-events-none">
                .csv 파일만 지원
              </div>
              <div className="text-xs text-[#475569] font-mono break-all max-w-2xl mx-auto pointer-events-none">
                컬럼: {CSV_COLUMNS.join(', ')}
              </div>
            </div>
          )}

          {/* Upload Result */}
          {uploadResult && (
            <div className="bg-[#0f172a] border border-[#334155] rounded-lg p-3 mb-4">
              <div className="flex items-center gap-4 text-xs">
                <span className="text-[#22c55e] font-semibold">추가: {uploadResult.added}개</span>
                <span className="text-[#64748b]">건너뜀: {uploadResult.skipped}개</span>
                <span className="text-[#64748b]">전체: {uploadResult.total}행</span>
                <span className="text-[#64748b]">|</span>
                {Object.entries(uploadResult.byTeam).filter(([, v]) => v > 0).map(([k, v]) => (
                  <span key={k} className="text-[#94a3b8]">{k}: {v}개</span>
                ))}
              </div>
            </div>
          )}

          {/* 전체 진행률 */}
          {isRunning && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-[#94a3b8]">전체 진행률</span>
                <span className="text-xs font-bold text-[#f1f5f9]">{overallProgress}%</span>
              </div>
              <div className="h-2 bg-[#334155] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#3b82f6] to-[#22c55e] transition-all duration-500"
                  style={{ width: `${overallProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* ─── 3 Teams Progress Grid ─── */}
          <div className="grid grid-cols-3 gap-4">
            {TEAMS.map((team) => {
              const job = activeJobs.find((j) => j.team === team.key);
              const logs = allJobLogs[team.key] || [];
              const progress = teamProgress[team.key] || { buyers: 0, validEmails: 0, drafts: 0 };
              const teamDone = PIPELINE_STEPS.every((s) => teamStepStatuses[team.key]?.[s.key] === 'done');
              const teamFailed = job?.status === 'failed';

              return (
                <div key={team.key} className={`bg-[#0f172a] border rounded-lg p-4 ${
                  teamFailed ? 'border-[#ef4444]/40' :
                  teamDone ? 'border-[#22c55e]/40' :
                  job?.status === 'running' ? 'border-[#f59e0b]/40' :
                  'border-[#334155]'
                }`}>
                  {/* Team Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{team.flag}</span>
                      <span className="text-sm font-bold text-[#f1f5f9]">{team.label}</span>
                    </div>
                    {teamDone && <span className="text-xs bg-[#22c55e]/20 text-[#22c55e] px-2 py-0.5 rounded font-semibold">완료</span>}
                    {teamFailed && <span className="text-xs bg-[#ef4444]/20 text-[#ef4444] px-2 py-0.5 rounded font-semibold">실패</span>}
                    {job?.status === 'running' && <span className="text-xs bg-[#f59e0b]/20 text-[#f59e0b] px-2 py-0.5 rounded font-semibold animate-pulse">실행 중</span>}
                  </div>

                  {/* Team Stats */}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="text-center p-1.5 bg-[#1e293b] rounded">
                      <div className="text-xs text-[#64748b]">기업</div>
                      <div className="text-sm font-bold text-[#3b82f6]">{progress.buyers}</div>
                    </div>
                    <div className="text-center p-1.5 bg-[#1e293b] rounded">
                      <div className="text-xs text-[#64748b]">유효메일</div>
                      <div className="text-sm font-bold text-[#8b5cf6]">{progress.validEmails}</div>
                    </div>
                    <div className="text-center p-1.5 bg-[#1e293b] rounded">
                      <div className="text-xs text-[#64748b]">초안</div>
                      <div className="text-sm font-bold text-[#22c55e]">{progress.drafts}</div>
                    </div>
                  </div>

                  {/* Steps */}
                  <div className="space-y-1.5">
                    {PIPELINE_STEPS.map((step) => {
                      const display = getStepDisplay(team.key, step.key, job?.current_agent, job?.status);
                      const stepLog = logs.find((l) => l.agent === step.key && l.status !== 'running');

                      return (
                        <div key={step.key} className="flex items-center gap-2 py-1">
                          <div className={`w-5 h-5 rounded-full ${display.color} flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${display.pulse ? 'animate-pulse' : ''}`}>
                            {display.label === '완료' ? '✓' : display.label === '오류' ? '✕' : step.key}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-[#94a3b8] truncate">{step.name.split('—')[1]?.trim() || step.name}</div>
                          </div>
                          <span className={`text-xs font-semibold ${display.text} flex-shrink-0`}>{display.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ─── Logs + Recent Jobs ─── */}
        <div className="grid grid-cols-2 gap-4">
          {/* 실시간 로그 (전체 팀) */}
          <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-5">
            <div className="text-sm font-semibold text-[#f1f5f9] mb-3">실시간 로그</div>
            <div className="space-y-1 max-h-[300px] overflow-y-auto">
              {Object.values(allJobLogs).flat().length === 0 ? (
                <div className="text-xs text-[#475569] p-3 text-center">
                  파이프라인을 실행하면 로그가 표시됩니다
                </div>
              ) : (
                Object.entries(allJobLogs).flatMap(([team, logs]) =>
                  logs.map((log, idx) => ({ ...log, team, _key: `${team}-${idx}` }))
                )
                .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                .slice(-50)
                .map((log) => (
                  <div key={log._key} className="flex items-start gap-2 p-2 bg-[#0f172a] rounded border border-[#334155]">
                    <span className="text-xs text-[#475569] whitespace-nowrap flex-shrink-0">
                      {new Date(log.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    <span className="text-xs bg-[#334155] text-[#94a3b8] px-1 py-0.5 rounded flex-shrink-0">{log.team}</span>
                    <span className={`text-xs px-1 py-0.5 rounded font-semibold flex-shrink-0 ${
                      log.agent === 'B' ? 'bg-[#8b5cf6]/20 text-[#8b5cf6]' :
                      log.agent === 'C' ? 'bg-[#f59e0b]/20 text-[#f59e0b]' :
                      log.agent === 'D' ? 'bg-[#22c55e]/20 text-[#22c55e]' :
                      log.agent === 'E' ? 'bg-[#ef4444]/20 text-[#ef4444]' :
                      'bg-[#64748b]/20 text-[#64748b]'
                    }`}>{log.agent}</span>
                    <span className={`text-xs flex-1 ${
                      log.status === 'completed' ? 'text-[#22c55e]' :
                      log.status === 'failed' ? 'text-[#ef4444]' : 'text-[#94a3b8]'
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
                <div className="text-xs text-[#475569] p-3 text-center">아직 실행 기록이 없습니다</div>
              ) : (
                recentJobs.map((job) => (
                  <div key={job.id} className="flex items-center justify-between p-3 bg-[#0f172a]/50 rounded-lg border border-[#334155]">
                    <div className="flex items-center gap-3">
                      <span className={`w-2 h-2 rounded-full ${
                        job.status === 'completed' ? 'bg-[#22c55e]' :
                        job.status === 'running' ? 'bg-[#f59e0b] animate-pulse' :
                        job.status === 'failed' ? 'bg-[#ef4444]' : 'bg-[#64748b]'
                      }`} />
                      <div>
                        <div className="text-xs font-semibold text-[#f1f5f9]">{job.team} 팀</div>
                        <div className="text-xs text-[#64748b]">
                          {new Date(job.created_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded font-semibold ${
                      job.status === 'completed' ? 'bg-[#22c55e]/20 text-[#22c55e]' :
                      job.status === 'running' ? 'bg-[#f59e0b]/20 text-[#f59e0b]' :
                      job.status === 'failed' ? 'bg-[#ef4444]/20 text-[#ef4444]' :
                      'bg-[#64748b]/20 text-[#64748b]'
                    }`}>
                      {job.status === 'completed' ? '완료' : job.status === 'running' ? '실행 중' : job.status === 'failed' ? '실패' : '대기'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
