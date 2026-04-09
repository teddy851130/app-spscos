export interface Buyer {
  id: string
  company_name: string
  website?: string
  domain?: string
  region: 'GCC' | 'USA' | 'Europe'
  tier: 'Tier1' | 'Tier2' | 'Tier3'
  contact_name?: string
  contact_title?: string
  contact_email?: string
  linkedin_url?: string
  employee_count?: number
  est_revenue?: string
  annual_revenue?: number
  open_jobs_signal?: boolean
  recent_news?: CompanyAnalysis | null
  team?: 'GCC' | 'USA' | 'Europe'
  k_beauty_flag: 'Y' | 'N' | 'Unknown'
  status: 'Cold' | 'Contacted' | 'Replied' | 'Interested' | 'Sample' | 'Deal' | 'Lost'
  is_blacklisted?: boolean
  discovered_at?: string
  job_id?: string
  notes?: string
  created_at: string
  updated_at: string
}

export interface CompanyAnalysis {
  company_summary?: string
  kbeauty_interest?: 'low' | 'medium' | 'high'
  recommended_formulas?: string[]
  pitch_angle?: string
  analysis_date?: string
  raw?: string
}

export interface BuyerContact {
  id: string
  buyer_id: string
  contact_name: string
  contact_title: string
  contact_email: string
  email_status?: 'valid' | 'invalid' | 'catch-all' | 'risky' | 'unknown' | null
  linkedin_url?: string
  work_history_summary?: string
  is_primary: boolean
  source?: string
  created_at?: string
}

export interface EmailDraft {
  id: string
  buyer_contact_id: string
  subject_line_1: string
  subject_line_2: string
  subject_line_3: string
  body_first: string
  body_followup: string
  tier: 'Tier1' | 'Tier2'
  spam_score?: number
  spam_status?: 'pass' | 'flag' | 'rewrite' | null
  is_sent: boolean
  sent_at?: string
  created_at?: string
  // joined fields
  buyer_contact?: BuyerContact
  buyer?: Buyer
}

export interface PipelineJob {
  id: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  team: 'GCC' | 'USA' | 'Europe'
  current_agent?: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | null
  started_at?: string
  completed_at?: string
  error_log?: string
  created_at: string
}

export interface PipelineLog {
  id: string
  job_id: string
  agent: 'A' | 'B' | 'C' | 'D' | 'E' | 'F'
  status: 'running' | 'completed' | 'failed' | 'skipped'
  message: string
  credits_used: number
  api_cost_usd: number
  created_at: string
}

export interface EmailLog {
  id: string
  buyer_id: string
  email_type: 'initial' | 'followup1' | 'followup2' | 'breakup'
  subject: string
  body_en?: string
  body_ko?: string
  status: 'draft' | 'sent' | 'opened' | 'replied' | 'bounced' | 'spam'
  sent_at?: string
  opened_at?: string
  replied_at?: string
  gmail_message_id?: string
  pipedrive_bcc_sent: boolean
  created_at: string
}

export interface KPISnapshot {
  id: string
  snapshot_date: string
  region: 'GCC' | 'USA' | 'Europe'
  emails_sent: number
  emails_opened: number
  emails_replied: number
  emails_bounced: number
  open_rate: number
  reply_rate: number
  bounce_rate: number
  spam_rate: number
  new_leads: number
}

export interface PipelineRun {
  id: string
  run_date: string
  employee: 'A' | 'B' | 'C' | 'D' | 'E' | 'F'
  region: 'GCC' | 'USA' | 'Europe' | 'ALL'
  status: 'pending' | 'running' | 'completed' | 'failed'
  input_count: number
  output_count: number
  notes?: string
  started_at?: string
  completed_at?: string
}
