import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Edge Function 호출 헬퍼
// supabase.functions.invoke는 현재 로그인 세션의 JWT를 Authorization 헤더로 보내는데,
// 세션이 만료됐거나 자동 갱신이 실패하면 401 Unauthorized로 떨어짐.
// anon key를 직접 명시해서 세션 상태와 무관하게 항상 유효한 JWT로 호출.
export async function invokePipeline(jobId: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${supabaseUrl}/functions/v1/run-pipeline`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${supabaseAnonKey}`,
      apikey: supabaseAnonKey,
    },
    body: JSON.stringify({ jobId }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Edge Function 호출 실패: HTTP ${res.status} ${body}`)
  }

  return await res.json()
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
