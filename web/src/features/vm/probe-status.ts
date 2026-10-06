export type ProbeCheck = {
  at?: string
  probed_at?: string
  ok?: boolean
  source?: string
  via?: string
  error?: unknown
  data_at?: string | null
}

export function latestProbe(...records: (ProbeCheck | null | undefined)[]) {
  return (
    records
      .filter((p): p is ProbeCheck => !!p)
      .sort(
        (a, b) =>
          (Date.parse(b.at || b.probed_at || '') || 0) -
          (Date.parse(a.at || a.probed_at || '') || 0)
      )[0] || {}
  )
}

export function probeSourceLabel(source?: string) {
  return source === 'messages-headers' ? '请求响应头（缓存）' : source || '—'
}

export function probeOutcome(probe: ProbeCheck): string {
  if (probe.ok === false) {
    const error = probe.error
    const details =
      error && typeof error === 'object' && !Array.isArray(error)
        ? (error as Record<string, unknown>)
        : null
    const candidates = details
      ? [details.message, details.code, details.type]
      : [error]
    return (
      candidates.find(
        (value): value is string =>
          typeof value === 'string' && value.trim().length > 0
      ) || '探测失败'
    )
  }
  if (probe.ok === true)
    return probe.source === 'messages-headers' ? '已读取缓存' : '探测成功'
  return '—'
}
