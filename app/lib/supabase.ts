import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Edge Function 호출 헬퍼
export async function invokePipeline(jobId: string): Promise<{ success: boolean; message: string }> {
  const { data, error } = await supabase.functions.invoke('run-pipeline', {
    body: { jobId },
  })

  if (error) {
    throw new Error(error.message || 'Edge Function 호출 실패')
  }

  return data
}

// 파이프라인 실행 요청 생성 + Edge Function 트리거
export async function startPipeline(team: 'GCC' | 'USA' | 'Europe'): Promise<{
  jobId: string
  message: string
}> {
  // 1. pipeline_jobs에 INSERT
  const { data: job, error: insertError } = await supabase
    .from('pipeline_jobs')
    .insert({ team, status: 'pending' })
    .select('id')
    .single()

  if (insertError || !job) {
    throw new Error(insertError?.message || '파이프라인 생성 실패')
  }

  // 2. Edge Function 트리거 (비동기 - 응답 안 기다림)
  try {
    await invokePipeline(job.id)
  } catch {
    // Edge Function 호출 실패해도 job은 이미 생성됨
    // 상태는 pending으로 유지
  }

  return {
    jobId: job.id,
    message: '파이프라인이 시작되었습니다. 브라우저를 닫으셔도 됩니다.',
  }
}
