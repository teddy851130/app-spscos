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
  const [uploadedFile, setUploadedFile] = useState<{ name: string; size: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 파일 크기 표시용 포맷 (Bytes/KB/MB)
  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

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

      // 기존 buyers 조회 (중복 체크 + 담당자 추가 결정에 tier 필요)
      const { data: existingBuyers } = await supabase
        .from('buyers').select('id, domain, tier').not('domain', 'is', null);
      const existingByDomain = new Map<string, { id: string; tier: 'Tier1' | 'Tier2' | 'Tier3' }>();
      for (const b of (existingBuyers || []) as { id: string; domain: string; tier: string }[]) {
        if (b.domain) {
          existingByDomain.set(
            b.domain.toLowerCase(),
            { id: b.id, tier: (b.tier || 'Tier2') as 'Tier1' | 'Tier2' | 'Tier3' }
          );
        }
      }

      // tier 정규화: '1'/1 → 'Tier1', '2'/2 → 'Tier2', '3'/3 → 'Tier3' (CHECK 제약: Tier1/Tier2/Tier3)
      const normalizeTier = (raw: string | number): 'Tier1' | 'Tier2' | 'Tier3' => {
        const t = (raw ?? '').toString().replace(/\s+/g, '').toLowerCase();
        if (t === 'tier1' || t === '1') return 'Tier1';
        if (t === 'tier2' || t === '2') return 'Tier2';
        if (t === 'tier3' || t === '3') return 'Tier3';
        return 'Tier2';
      };
      // team/region 정규화 (CHECK 제약: GCC/USA/Europe)
      const normalizeTeam = (raw: string): 'GCC' | 'USA' | 'Europe' => {
        const t = (raw || '').toString().trim().toLowerCase();
        if (t === 'gcc') return 'GCC';
        if (raw === '미국' || t === 'usa' || t === 'us' || t === 'america' || t === 'united states') return 'USA';
        if (raw === '유럽' || t === 'europe' || t === 'eu' || t === 'eur') return 'Europe';
        return 'GCC';
      };
      // boolean 정규화: 'true'/'1'/'TRUE'/'yes' 모두 true
      const normalizeBool = (raw: string): boolean => {
        const v = (raw || '').toString().trim().toLowerCase();
        return v === 'true' || v === '1' || v === 'yes' || v === 'y';
      };

      // ICP 직함 매칭: 직무 키워드 + 시니어리티 키워드 둘 다 포함 (VP는 Tier1만)
      const ICP_TITLE_KW = ['buying', 'procurement', 'beauty', 'npd', 'sourcing', 'product development'];
      const ICP_SENIORITY_T1 = ['manager', 'senior manager', 'director', 'vp'];
      const ICP_SENIORITY_OTHER = ['manager', 'senior manager', 'director'];
      const isIcpTitle = (title: string, tier: 'Tier1' | 'Tier2' | 'Tier3'): boolean => {
        const t = (title || '').toLowerCase();
        if (!t) return false;
        const hasTitleKw = ICP_TITLE_KW.some((k) => t.includes(k));
        const seniorityList = tier === 'Tier1' ? ICP_SENIORITY_T1 : ICP_SENIORITY_OTHER;
        const hasSeniorityKw = seniorityList.some((k) => t.includes(k));
        return hasTitleKw && hasSeniorityKw;
      };

      let added = 0;          // 신규 buyers 생성 수
      let addedContacts = 0;  // 기존 buyer에 추가된 contact 수
      let skipped = 0;
      const byTeam: Record<string, number> = { GCC: 0, USA: 0, Europe: 0 };
      let firstError: string | null = null;

      for (const row of rows) {
        const domain = (row.domain || '').toLowerCase().trim();
        if (!domain || !row.company_name) { skipped++; continue; }

        const existingBuyer = existingByDomain.get(domain);

        // ── 기존 buyer: 담당자 추가 조건 체크 후 buyer_contacts만 INSERT ──
        if (existingBuyer) {
          // contact 정보가 없거나 ICP 직함이 아니면 스킵
          if (!row.contact_name || !row.contact_email || !row.contact_title) {
            skipped++; continue;
          }
          if (!isIcpTitle(row.contact_title, existingBuyer.tier)) {
            skipped++; continue;
          }

          // 현재 담당자 수 + 이메일 중복 체크 (최대 3명 유지 → 현재 2명 이하일 때 추가)
          const { data: currentContacts } = await supabase
            .from('buyer_contacts')
            .select('contact_email')
            .eq('buyer_id', existingBuyer.id);
          const contactCount = currentContacts?.length || 0;
          if (contactCount >= 3) { skipped++; continue; }

          const emailLower = row.contact_email.toLowerCase();
          const dup = (currentContacts || []).some(
            (c: { contact_email: string | null }) =>
              (c.contact_email || '').toLowerCase() === emailLower
          );
          if (dup) { skipped++; continue; }

          const { error: contactError } = await supabase.from('buyer_contacts').insert({
            buyer_id: existingBuyer.id,
            contact_name: row.contact_name,
            contact_title: row.contact_title,
            contact_email: row.contact_email,
            linkedin_url: row.linkedin_url || '',
            is_primary: false,
            source: 'csv',
          });
          if (contactError) {
            console.error('buyer_contacts INSERT 실패:', contactError, 'row:', row);
            if (!firstError) firstError = `buyer_contacts: ${contactError.message}`;
            skipped++;
            continue;
          }
          addedContacts++;
          continue;
        }

        // ── 신규 buyer 생성 경로 ──
        const team = normalizeTeam(row.team || 'GCC');
        const tier = normalizeTier(row.tier || 'Tier2');
        // annual_revenue는 TEXT 타입 — 원본 문자열 그대로 저장 (빈 값은 null)
        const annualRevenue = (row.annual_revenue || '').toString().trim() || null;

        // buyers INSERT (recent_news는 직원 C가 자동 채움)
        // icp_score는 buyers 테이블에 없으므로 INSERT에서 제외
        const { data: newBuyer, error: insertError } = await supabase.from('buyers').insert({
          company_name: row.company_name,
          domain,
          website: `https://${domain}`,
          region: team,
          team,
          tier,
          annual_revenue: annualRevenue,
          open_jobs_signal: normalizeBool(row.open_jobs_signal),
          status: 'Cold',
          k_beauty_flag: 'Unknown',
          is_blacklisted: false,
        }).select('id').single();

        if (insertError) {
          console.error('buyers INSERT 실패:', insertError, 'row:', row);
          if (!firstError) firstError = `buyers: ${insertError.message}`;
          skipped++;
          continue;
        }
        if (!newBuyer) { skipped++; continue; }

        // 신규 buyer의 primary contact INSERT (contact 정보가 있으면)
        if (row.contact_name && row.contact_email) {
          const { error: contactError } = await supabase.from('buyer_contacts').insert({
            buyer_id: newBuyer.id,
            contact_name: row.contact_name,
            contact_title: row.contact_title || '',
            contact_email: row.contact_email,
            linkedin_url: row.linkedin_url || '',
            is_primary: true,
            source: 'csv',
          });
          if (contactError) {
            console.error('buyer_contacts INSERT 실패:', contactError, 'row:', row);
            if (!firstError) firstError = `buyer_contacts: ${contactError.message}`;
          }
        }

        existingByDomain.set(domain, { id: newBuyer.id, tier });
        added++;
        byTeam[team] = (byTeam[team] || 0) + 1;
      }

      setUploadResult({ added, skipped, total: rows.length, byTeam });
      // CSV 파싱이 성공했으면 파일명은 항상 표시 (added=0이어도)
      setUploadedFile({ name: file.name, size: file.size });
      // 실행 버튼 활성화: 이번에 뭔가 추가됐거나, 이미 buyers에 데이터가 있으면 true
      const hasExistingBuyers = existingByDomain.size > 0;
      setCsvUploaded(added > 0 || addedContacts > 0 || hasExistingBuyers);
      if (firstError) {
        setSuccessMessage(`CSV 부분 오류: 신규 ${added}개 / 담당자 추가 ${addedContacts}명 / 건너뜀 ${skipped}개. 첫 오류 — ${firstError}`);
      } else if (added > 0 && addedContacts > 0) {
        setSuccessMessage(`CSV 완료: 신규 기업 ${added}개 + 기존 기업 담당자 ${addedContacts}명 추가, ${skipped}개 건너뜀`);
      } else if (added > 0) {
        setSuccessMessage(`CSV 업로드 완료: ${added}개 기업 추가, ${skipped}개 건너뜀`);
      } else if (addedContacts > 0) {
        setSuccessMessage(`기존 기업에 담당자 ${addedContacts}명 추가 (신규 기업 없음, ${skipped}개 건너뜀)`);
      } else if (hasExistingBuyers) {
        setSuccessMessage(`새로운 데이터 없음 (${skipped}개 건너뜀). 기존 buyers ${existingByDomain.size}개로 파이프라인 실행 가능`);
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

  const dragCounter = useRef(0);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('dragEnter');
    dragCounter.current++;
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('dragLeave');
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('dragOver');
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    console.log('drop', file);
    dragCounter.current = 0;
    setIsDragging(false);
    if (file && file.name.endsWith('.csv')) {
      processCSVFile(file);
    } else {
      alert('CSV 파일만 업로드 가능합니다.');
    }
  };

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
    if (!status || status === 'waiting') return { color: 'bg-[#e3e8ee]', text: 'text-[#8792a2]', label: '대기', pulse: false };
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
        <div className="bg-[#ffffff] border border-[#e3e8ee] rounded-lg p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-sm font-semibold text-[#1a1f36]">파이프라인 — CSV 업로드 → B→C→D→E→F 자동 실행</div>
              <div className="text-xs text-[#8792a2] mt-1">
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
                className="px-4 py-2 bg-[#e3e8ee] border border-[#8792a2] rounded-lg text-white text-sm font-semibold hover:bg-[#8792a2] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
                className="px-5 py-2 bg-[#635BFF] rounded-lg text-white text-sm font-semibold hover:bg-[#5851DB] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => !isUploading && fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-6 mb-4 text-center cursor-pointer transition-all select-none ${
                isDragging
                  ? 'border-[#635BFF] bg-[#635BFF]/15 scale-[1.01] shadow-lg shadow-[#635BFF]/20'
                  : uploadedFile
                    ? 'border-[#22c55e] bg-[#22c55e]/10 hover:bg-[#22c55e]/15'
                    : 'border-[#8792a2] bg-[#f6f8fa] hover:border-[#635BFF]/60 hover:bg-[#f6f8fa]/80'
              } ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {uploadedFile && !isDragging && !isUploading ? (
                // 업로드 성공 상태 — 파일 카드 + X 버튼
                <div className="flex items-center justify-center gap-3">
                  <div className="text-3xl" style={{ pointerEvents: 'none' }}>📄</div>
                  <div className="text-left" style={{ pointerEvents: 'none' }}>
                    <div className="text-sm font-semibold text-[#22c55e] break-all">
                      {uploadedFile.name}
                    </div>
                    <div className="text-xs text-[#8792a2]">
                      {formatFileSize(uploadedFile.size)} · 업로드 완료
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setUploadedFile(null);
                      setCsvUploaded(false);
                      setUploadResult(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    aria-label="업로드된 파일 제거"
                    className="ml-2 w-7 h-7 flex items-center justify-center rounded-full bg-[#ffffff] hover:bg-[#ef4444] text-[#697386] hover:text-white transition-colors text-sm font-bold"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <>
                  <div className="text-4xl mb-2" style={{ pointerEvents: 'none' }}>
                    {isDragging ? '⬇️' : '📄'}
                  </div>
                  <div
                    className={`text-sm font-semibold mb-1 ${isDragging ? 'text-[#635BFF]' : 'text-[#1a1f36]'}`}
                    style={{ pointerEvents: 'none' }}
                  >
                    {isUploading
                      ? '업로드 중...'
                      : isDragging
                        ? '여기에 CSV 파일을 놓으세요'
                        : '여기에 CSV 파일을 드래그하거나 클릭해서 업로드'}
                  </div>
                  <div className="text-xs text-[#8792a2] mb-3" style={{ pointerEvents: 'none' }}>
                    .csv 파일만 지원
                  </div>
                  <div
                    className="text-xs text-[#8792a2] font-mono break-all max-w-2xl mx-auto"
                    style={{ pointerEvents: 'none' }}
                  >
                    컬럼: {CSV_COLUMNS.join(', ')}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Upload Result */}
          {uploadResult && (
            <div className="bg-[#f6f8fa] border border-[#e3e8ee] rounded-lg p-3 mb-4">
              <div className="flex items-center gap-4 text-xs">
                <span className="text-[#22c55e] font-semibold">추가: {uploadResult.added}개</span>
                <span className="text-[#8792a2]">건너뜀: {uploadResult.skipped}개</span>
                <span className="text-[#8792a2]">전체: {uploadResult.total}행</span>
                <span className="text-[#8792a2]">|</span>
                {Object.entries(uploadResult.byTeam).filter(([, v]) => v > 0).map(([k, v]) => (
                  <span key={k} className="text-[#697386]">{k}: {v}개</span>
                ))}
              </div>
            </div>
          )}

          {/* 전체 진행률 */}
          {isRunning && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-[#697386]">전체 진행률</span>
                <span className="text-xs font-bold text-[#1a1f36]">{overallProgress}%</span>
              </div>
              <div className="h-2 bg-[#e3e8ee] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#635BFF] to-[#22c55e] transition-all duration-500"
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
                <div key={team.key} className={`bg-[#f6f8fa] border rounded-lg p-4 ${
                  teamFailed ? 'border-[#ef4444]/40' :
                  teamDone ? 'border-[#22c55e]/40' :
                  job?.status === 'running' ? 'border-[#f59e0b]/40' :
                  'border-[#e3e8ee]'
                }`}>
                  {/* Team Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{team.flag}</span>
                      <span className="text-sm font-bold text-[#1a1f36]">{team.label}</span>
                    </div>
                    {teamDone && <span className="text-xs bg-[#22c55e]/20 text-[#22c55e] px-2 py-0.5 rounded font-semibold">완료</span>}
                    {teamFailed && <span className="text-xs bg-[#ef4444]/20 text-[#ef4444] px-2 py-0.5 rounded font-semibold">실패</span>}
                    {job?.status === 'running' && <span className="text-xs bg-[#f59e0b]/20 text-[#f59e0b] px-2 py-0.5 rounded font-semibold animate-pulse">실행 중</span>}
                  </div>

                  {/* Team Stats */}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="text-center p-1.5 bg-[#ffffff] rounded">
                      <div className="text-xs text-[#8792a2]">기업</div>
                      <div className="text-sm font-bold text-[#635BFF]">{progress.buyers}</div>
                    </div>
                    <div className="text-center p-1.5 bg-[#ffffff] rounded">
                      <div className="text-xs text-[#8792a2]">유효메일</div>
                      <div className="text-sm font-bold text-[#8b5cf6]">{progress.validEmails}</div>
                    </div>
                    <div className="text-center p-1.5 bg-[#ffffff] rounded">
                      <div className="text-xs text-[#8792a2]">초안</div>
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
                            <div className="text-xs text-[#697386] truncate">{step.name.split('—')[1]?.trim() || step.name}</div>
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
          <div className="bg-[#ffffff] border border-[#e3e8ee] rounded-lg p-5">
            <div className="text-sm font-semibold text-[#1a1f36] mb-3">실시간 로그</div>
            <div className="space-y-1 max-h-[300px] overflow-y-auto">
              {Object.values(allJobLogs).flat().length === 0 ? (
                <div className="text-xs text-[#8792a2] p-3 text-center">
                  파이프라인을 실행하면 로그가 표시됩니다
                </div>
              ) : (
                Object.entries(allJobLogs).flatMap(([team, logs]) =>
                  logs.map((log, idx) => ({ ...log, team, _key: `${team}-${idx}` }))
                )
                .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                .slice(-50)
                .map((log) => (
                  <div key={log._key} className="flex items-start gap-2 p-2 bg-[#f6f8fa] rounded border border-[#e3e8ee]">
                    <span className="text-xs text-[#8792a2] whitespace-nowrap flex-shrink-0">
                      {new Date(log.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    <span className="text-xs bg-[#e3e8ee] text-[#697386] px-1 py-0.5 rounded flex-shrink-0">{log.team}</span>
                    <span className={`text-xs px-1 py-0.5 rounded font-semibold flex-shrink-0 ${
                      log.agent === 'B' ? 'bg-[#8b5cf6]/20 text-[#8b5cf6]' :
                      log.agent === 'C' ? 'bg-[#f59e0b]/20 text-[#f59e0b]' :
                      log.agent === 'D' ? 'bg-[#22c55e]/20 text-[#22c55e]' :
                      log.agent === 'E' ? 'bg-[#ef4444]/20 text-[#ef4444]' :
                      'bg-[#8792a2]/20 text-[#8792a2]'
                    }`}>{log.agent}</span>
                    <span className={`text-xs flex-1 ${
                      log.status === 'completed' ? 'text-[#22c55e]' :
                      log.status === 'failed' ? 'text-[#ef4444]' : 'text-[#697386]'
                    }`}>{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 최근 실행 기록 */}
          <div className="bg-[#ffffff] border border-[#e3e8ee] rounded-lg p-5">
            <div className="text-sm font-semibold text-[#1a1f36] mb-3">최근 실행 기록</div>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {recentJobs.length === 0 ? (
                <div className="text-xs text-[#8792a2] p-3 text-center">아직 실행 기록이 없습니다</div>
              ) : (
                recentJobs.map((job) => (
                  <div key={job.id} className="flex items-center justify-between p-3 bg-[#f6f8fa]/50 rounded-lg border border-[#e3e8ee]">
                    <div className="flex items-center gap-3">
                      <span className={`w-2 h-2 rounded-full ${
                        job.status === 'completed' ? 'bg-[#22c55e]' :
                        job.status === 'running' ? 'bg-[#f59e0b] animate-pulse' :
                        job.status === 'failed' ? 'bg-[#ef4444]' : 'bg-[#8792a2]'
                      }`} />
                      <div>
                        <div className="text-xs font-semibold text-[#1a1f36]">{job.team} 팀</div>
                        <div className="text-xs text-[#8792a2]">
                          {new Date(job.created_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded font-semibold ${
                      job.status === 'completed' ? 'bg-[#22c55e]/20 text-[#22c55e]' :
                      job.status === 'running' ? 'bg-[#f59e0b]/20 text-[#f59e0b]' :
                      job.status === 'failed' ? 'bg-[#ef4444]/20 text-[#ef4444]' :
                      'bg-[#8792a2]/20 text-[#8792a2]'
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
