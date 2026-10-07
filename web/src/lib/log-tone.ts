import type { StatusTone } from '@/types/status'

export const ERROR_CLASS_TONE: Record<string, string> = {
  auth: 'caution',
  request: 'caution',
  signature: 'caution',
  rate_limit: 'caution',
  quota: 'warn',
  overloaded: 'bad',
  unavailable: 'warn',
  timeout: 'bad',
  credential: 'caution',
  proxy: 'bad',
  upstream: 'bad',
  other: 'bad',
  distill: 'caution',
  refusal: 'bad',
}

export function statusTone(status: unknown): StatusTone {
  const raw = status == null || status === '' ? '' : String(status)
  const n = Number(status)
  if (Number.isFinite(n) && n >= 100) return httpStatusTone(n)
  if (!raw) return { key: 'none', text: '—', cls: 'none', label: '—' }
  if (raw === 'error' || raw === 'failed' || raw === 'fail') {
    return { key: 'bad', text: raw, cls: 'bad', label: raw }
  }
  if (raw === 'ok' || raw === 'success' || raw === 'complete') {
    return { key: 'ok', text: raw, cls: 'ok', label: raw }
  }
  return { key: 'none', text: raw, cls: 'none', label: raw }
}

export function httpStatusTone(n: number): StatusTone {
  const label = String(n)
  if (n >= 200 && n < 300) return { key: 'ok', text: label, cls: 'ok', label }
  if (n >= 400 && n < 500)
    return { key: 'caution', text: label, cls: 'caution', label }
  if (n >= 500) return { key: 'bad', text: label, cls: 'bad', label }
  return { key: 'none', text: label, cls: 'none', label }
}

export function errorClassTone(
  item: Record<string, unknown>
): StatusTone | null {
  const cls = item.error_class == null ? '' : String(item.error_class)
  const label =
    item.error_label == null || item.error_label === ''
      ? cls
      : String(item.error_label)
  if (!cls && !label) return null
  return {
    key: cls || label,
    text: label,
    cls: (cls && ERROR_CLASS_TONE[cls]) || 'bad',
    label,
  }
}
