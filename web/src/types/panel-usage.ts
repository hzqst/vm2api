import type { BillingSnapshot } from './panel-overview'

export type UsageAccountRow = {
  account_id?: string
  vm_id?: string
  email?: string
  credential_mode?: 'oauth' | 'setup-token' | 'apikey' | string | null
  today_cost?: number
  total_cost?: number
  today_requests?: number
  today_input_tokens?: number
  today_output_tokens?: number
  today_cache_read_tokens?: number
  today_cache_creation_tokens?: number
  window_5h_cost?: number
  window_7d_cost?: number
  window_7d_requests?: number
  window_7d_success?: number
  window_7d_errors?: number
  window_7d_tokens?: number
  cache_hit_rate?: number | null
  today?: {
    requests?: number
    total_cost?: number
    input_tokens?: number
    output_tokens?: number
    cache_read_tokens?: number
    cache_creation_tokens?: number
    [key: string]: unknown
  } | null
  [key: string]: unknown
}
export type UsagePayload = {
  accounts?: UsageAccountRow[]
  totals?: Record<string, unknown>
  billing?: BillingSnapshot
  error?: string
}
