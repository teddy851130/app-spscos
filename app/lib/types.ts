export interface Buyer {
  id: string
  company_name: string
  website?: string
  region: 'GCC' | 'USA' | 'Europe'
  tier: 'Tier1' | 'Tier2' | 'Tier3'
  contact_name?: string
  contact_title?: string
  contact_email?: string
  linkedin_url?: string
  employee_count?: number
  est_revenue?: string
  k_beauty_flag: 'Y' | 'N' | 'Unknown'
  status: 'Cold' | 'Contacted' | 'Replied' | 'Interested' | 'Sample' | 'Deal' | 'Lost'
  notes?: string
  created_at: string
  updated_at: string
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
