/**
 * 用量数字的统一格式化，口径移植自 claude-code-hub
 * （`token.ts` / `currency.ts` / `performance-formatter.ts`）。
 * 日志页、统计页共用；面板只结算美元。
 */

const TOKEN_FORMAT: Intl.NumberFormatOptions = {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
}

/** <1K 原值，<1M 为 `x.xxK`，其余 `x.xxM`；空值 `-`。 */
export function formatTokenAmount(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '-'
  const abs = Math.abs(n)
  if (abs < 1000) return n.toLocaleString(undefined, TOKEN_FORMAT)
  if (abs < 1_000_000)
    return `${(n / 1000).toLocaleString(undefined, TOKEN_FORMAT)}K`
  return `${(n / 1_000_000).toLocaleString(undefined, TOKEN_FORMAT)}M`
}

/** `$` + 固定小数位（en-US 千分位）；空值按 0 计，与 hub 一致。 */
export function formatCurrency(
  v: number | null | undefined,
  digits = 2
): string {
  const value = v != null && Number.isFinite(v) ? v : 0
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`
}

/** ≥1000ms 显示 `1.23s`，否则 `850ms`；空值 `-`。 */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '-'
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`
  return `${Math.round(ms)}ms`
}

/**
 * 输出速率 tok/s。生成窗口以首 token 为起点（vm2api 没有独立的 TTFB，
 * hub 用 firstByteMs 的位置这里用 TTFT）；任一输入缺失或窗口非正返回 null。
 */
export function calculateOutputRate(
  outputTokens: number | null | undefined,
  durationMs: number | null | undefined,
  ttftMs: number | null | undefined
): number | null {
  if (outputTokens == null || outputTokens <= 0) return null
  if (durationMs == null || durationMs <= 0 || ttftMs == null) return null
  const generationMs = durationMs - ttftMs
  if (generationMs <= 0) return null
  return outputTokens / (generationMs / 1000)
}

/**
 * 被缓冲的流式请求：首 token 几乎贴着总耗时，算出来的速率是假的。
 * 规则同 hub：生成窗口 < 总耗时 10% 且速率 > 5000 tok/s 时隐藏。
 */
export function shouldHideOutputRate(
  rate: number | null,
  durationMs: number | null | undefined,
  ttftMs: number | null | undefined
): boolean {
  if (rate == null || !Number.isFinite(rate)) return false
  if (durationMs == null || durationMs <= 0 || ttftMs == null) return false
  const generationMs = durationMs - ttftMs
  if (generationMs <= 0) return false
  return generationMs / durationMs < 0.1 && rate > 5000
}

const NON_BILLING_ENDPOINTS: Record<string, true> = {
  '/v1/messages/count_tokens': true,
  '/v1/responses/compact': true,
}

/** 不计费端点：行置灰、成本列显示 `-`。 */
export function isNonBillingEndpoint(endpoint: string | null | undefined) {
  if (!endpoint) return false
  const normalized = endpoint.trim().toLowerCase().replace(/\/+$/, '')
  return NON_BILLING_ENDPOINTS[normalized] === true
}
