import type { Dashboard } from '@/types/panel-overview'
import type { StatusTone } from '@/types/status'
import { fmtCountdown, pct } from '@/lib/format'
import { fablePlanDenied, windowLimited } from '@/lib/vm-status'

/**
 * Fable 配额子系统的共享状态机。权威参考是 index.html 里的
 * `fableUsedOf` / `fableWeeklyFull` / `fableProbeLabel` / `fableBadge` /
 * `fableCard` / `concChip` / `rpmChip` / `sessionCapOf` / `vmCost` /
 * `extraUsageText` / `fmtReset` / `defaultConc` 等函数。
 *
 * Fable 字段（`fable` / `fable_max` / `fable_inflight` / `fable_cooldown_*` /
 * `utilization_7d_oi` / `reset_7d_oi` / `status_7d_oi`）在网关里既出现在
 * `/vms/:id` 的完整 Vm 对象上，也出现在 `/usage` 的账号行上（但用量行没有
 * `fable_max` / `fable_inflight` / `fable_cooldown_*` —— 那几个字段只在
 * `enrichVm()` 里算）。两种来源结构不同但字段名一致，所以这里用一个宽松的
 * `FableSubject`（`Record<string, unknown>`）承接，而不是强绑定 `Vm` 类型。
 *
 * `tierKey` 由调用方传入（`claudeTier(vm).key`），因为 `claudeTier` 只认
 * `Vm.has_token`，用量行天然没有这个字段——传参数而不是在这里重新推断，
 * 避免和 vm-status.ts 的 tier 判定逻辑产生第二份真相。
 */
export type FableSubject = Record<string, unknown>

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function relMs(ms: number): string {
  const s = Math.round(Math.abs(ms) / 1000)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.round(s / 60)}m`
  if (s < 86400) return `${Math.round(s / 3600)}h`
  return `${Math.round(s / 86400)}d`
}

/** 重置/过期时间统一转 ms：秒级 epoch、毫秒 epoch、日期串都收。 */
export function expiresAtToMs(v: unknown): number {
  if (v == null || v === '') return 0
  if (typeof v === 'number' && Number.isFinite(v)) {
    return v < 10_000_000_000 ? v * 1000 : v
  }
  const str = String(v).trim()
  if (!str) return 0
  if (/^\d+(\.\d+)?$/.test(str)) {
    const n = Number(str)
    if (!Number.isFinite(n) || n <= 0) return 0
    return n < 10_000_000_000 ? n * 1000 : n
  }
  const parsed = Date.parse(str)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * 重置倒计时（分钟精度）。无重置时间返回 null（调用方不占位）；
 * 已到点但后端还没刷新窗口时返回「已过重置」。
 */
export function resetCountdown(v: unknown, now = Date.now()): string | null {
  const t = expiresAtToMs(v)
  if (!t) return null
  const left = t - now
  if (left <= 0) return '已过重置'
  return fmtCountdown(left)
}

/** 重置时刻 `MM-DD HH:mm:ss`。列表用量列要「什么时候重置」，倒计时不够。 */
export function fmtResetClock(v: unknown): string | null {
  const t = expiresAtToMs(v)
  if (!t) return null
  const d = new Date(t)
  if (!Number.isFinite(d.getTime())) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** "剩 X 后重置" / "已过重置"。对齐 index.html 的 `fmtReset`。 */
export function fmtReset(v: unknown): string {
  if (!v) return ''
  const t = expiresAtToMs(v)
  if (!t) return String(v)
  const d = t - Date.now()
  return d >= 0 ? `${relMs(d)} 后重置` : '已过重置'
}

/** 用量/环形图着色阈值。对齐 index.html 的 `barColor`（100/95/85 三档）。 */
export function statusColorForPct(p: number): string {
  if (p >= 100) return 'var(--status-bad)'
  if (p >= 95) return 'var(--status-warn)'
  if (p >= 85) return 'var(--status-caution)'
  return 'var(--status-ok)'
}

/**
 * Fable 7d_oi 窗口是否是「继承自另一账号的伪造窗口」。对齐
 * index.html 的 `inventedFableWindow`。
 */
export function inventedFableWindow(subject: FableSubject): boolean {
  const fb = (subject.fable as Record<string, unknown> | undefined) || {}
  const st = num(fb.status)
  if (fb.ok) return false
  if (st !== 429 && !fb.limited) return false
  const oi = subject.utilization_7d_oi
  const reset = subject.reset_7d_oi
  if (oi == null && !reset) return true
  const n = Number(oi)
  const norm = Number.isFinite(n) ? (n > 1.5 ? n / 100 : n) : null
  return norm != null && norm >= 1 && !reset
}

/** Fable 已用比例（0-100 或 0-1，未归一化，交给 `pct()` 处理）。对齐 `fableUsedOf`。 */
export function fableUsedOf(
  subject: FableSubject,
  tierKey: string
): number | null {
  const fb = (subject.fable as Record<string, unknown> | undefined) || {}
  if (
    tierKey === 'pro' ||
    fablePlanDenied(fb) ||
    inventedFableWindow(subject)
  ) {
    return null
  }
  if (subject.utilization_7d_oi != null)
    return Number(subject.utilization_7d_oi)
  if (fb.utilization != null) return Number(fb.utilization)
  return null
}

/** 对齐 `fableWeeklyFull`。 */
export function fableWeeklyFull(
  subject: FableSubject,
  tierKey: string
): boolean {
  const fb = (subject.fable as Record<string, unknown> | undefined) || {}
  const used = fableUsedOf(subject, tierKey)
  if (windowLimited(subject.status_7d_oi, pct(used))) return true
  if (used != null) return pct(used) >= 100
  return Boolean(fb.limited)
}

/** 对齐 `fableProbeLabel`。 */
export function fableProbeLabel(
  subject: FableSubject,
  tierKey: string
): string {
  const fb = subject.fable as Record<string, unknown> | undefined
  if (tierKey === 'pro') return 'Pro 无 Fable'
  // 落盘 Max 但 Fable 被拒：套餐没带 Fable 权限，不是 Pro。
  if (fablePlanDenied(fb)) return '无 Fable 权限'
  if (!fb) return '未探测'
  if (fb.banned) return '账号拒'
  if (fableWeeklyFull(subject, tierKey)) return '周额度满'
  if (fb.ok) return '可用'
  const err = String(fb.error || '')
  if (/invalid_grant|refresh token|oauth refresh/i.test(err)) return '未探测'
  return String(fb.error || '—')
}

/**
 * Fable 探测态：`usedPct` 非空时调用方应画进度条/环（真实用量），
 * 为空时应改画 `tone` 徽标（未探测 / 周满 / 可用 / 账号拒）。
 * 对齐 `fableBadge`（把它拆成「数据」与「渲染」两半）。
 */
export function fableState(
  subject: FableSubject,
  tierKey: string
): { usedPct: number | null; tone: StatusTone } {
  const fb = subject.fable as Record<string, unknown> | undefined
  if (fb?.banned)
    return { usedPct: null, tone: { key: 'bad', cls: 'bad', text: '拒' } }
  const used = fableUsedOf(subject, tierKey)
  if (used != null) {
    const u = pct(used)
    return {
      usedPct: u,
      tone: { key: 'ok', cls: 'ok', text: `${u.toFixed(1)}%` },
    }
  }
  if (!fb)
    return { usedPct: null, tone: { key: 'none', cls: 'none', text: '未探测' } }
  if (fableWeeklyFull(subject, tierKey)) {
    return { usedPct: null, tone: { key: 'warn', cls: 'warn', text: '满' } }
  }
  if (fb.ok)
    return { usedPct: null, tone: { key: 'ok', cls: 'ok', text: '可用' } }
  return { usedPct: null, tone: { key: 'none', cls: 'none', text: '—' } }
}

/** Fable 5h 冷却/占满归一到 0-100，用于卡片小轨道。对齐 `fableUtil`。 */
export function fableUtil(subject: FableSubject, tierKey: string): number {
  const coolUntil = num(subject.fable_cooldown_until)
  if (coolUntil && coolUntil > Date.now()) return 100
  const fb = subject.fable as Record<string, unknown> | undefined
  if (fb?.banned) return 100
  if (
    fableWeeklyFull(subject, tierKey) &&
    fableUsedOf(subject, tierKey) == null
  ) {
    return 100
  }
  return pct(fableUsedOf(subject, tierKey))
}

/** 每账号 Fable 并发上限的兜底值。对齐 `fableCap`。 */
export function fableCap(dashboard: Dashboard | undefined): number {
  const routing = dashboard?.routing as
    { concurrency?: { fable_max_per_account?: number } } | undefined
  const n = Number(
    routing?.concurrency?.fable_max_per_account ??
      (dashboard?.routing as Record<string, unknown> | undefined)
        ?.fable_max_per_account ??
      (dashboard?.summary as Record<string, unknown> | undefined)
        ?.fable_max_per_account
  )
  return Number.isFinite(n) && n > 0 ? n : 4
}

export type SessionCapacity = {
  active: number
  max: number
}

export type ConcurrencyInfo = {
  max: number
  inf: number
  fmax: number
  fin: number
  cooling: boolean
  hot: boolean
  title: string
}

export type RpmInfo = {
  max: number
  n: number
  hot: boolean
}

export type VmCostSummary = {
  w: number
  today: number
  total: number
  req: number
  tok: number
}

export type WeeklySplitSummary = {
  share: number
  regularUsed: number
  regularRemain: number
  regularFill: number
  fableUsed: number
  fableRemain: number
  fableFill: number
}

/** Codex 会话上限快照（Claude 行不带会话字段，返回 null）。对齐 `sessionCapOf`。 */
export function sessionCapOf(subject: FableSubject): SessionCapacity | null {
  const sessions = subject.sessions as
    { active?: number; max?: number } | undefined
  const max = Number(subject.session_max ?? sessions?.max ?? 0)
  if (!max) return null
  const active = Number(subject.session_active ?? sessions?.active ?? 0)
  return { active, max }
}

/** 账号 + Fable 并发信息，供并发徽标渲染。对齐 `concChip`。 */
export function concInfo(
  subject: FableSubject,
  tiers: Record<string, { max_concurrency?: number }> | undefined,
  fableCapValue: number
): ConcurrencyInfo {
  const max =
    num(subject.max_concurrency) ||
    defaultConc(tiers, String(subject.account_tier || ''))
  const inf = num(subject.inflight)
  const fmax = num(subject.fable_max) || fableCapValue
  const fin = num(subject.fable_inflight)
  const coolUntil = num(subject.fable_cooldown_until)
  const cooling = Boolean(coolUntil) && coolUntil > Date.now()
  const hot = !cooling && fmax > 0 && fin >= fmax
  const sess = sessionCapOf(subject)
  const title = cooling
    ? `Fable 冷却${subject.fable_cooldown_reason ? ' · ' + String(subject.fable_cooldown_reason) : ''}`
    : `账号 ${inf}/${max} · Fable ${fin}/${fmax}${sess ? ` · 会话 ${sess.active}/${sess.max}` : ''}`
  return { max, inf, fmax, fin, cooling, hot, title }
}

/** RPM 徽标信息。对齐 `rpmChip`。 */
export function rpmInfo(
  subject: FableSubject,
  acc?: FableSubject
): RpmInfo | null {
  const max = Number(acc?.max_rpm ?? subject.max_rpm ?? 0)
  const n = Number(acc?.rpm ?? subject.rpm ?? 0)
  if (!max) return null
  return { max, n, hot: n >= max }
}

/** 每档位默认并发上限。对齐 `defaultConc`。 */
export function defaultConc(
  tiers: Record<string, { max_concurrency?: number }> | undefined,
  tier?: string
): number {
  const key = tier === 'pro' || tier === 'max' ? tier : 'default'
  const n = Number(
    tiers?.[key]?.max_concurrency ?? tiers?.default?.max_concurrency
  )
  return Number.isFinite(n) && n >= 0 ? n : 2
}

/** 5h 窗口花费/请求/tokens，及今日/累计花费。对齐 `vmCost`。 */
export function vmCost(subject: FableSubject): VmCostSummary {
  return {
    w: num(subject.window_5h_cost),
    today: num(subject.today_cost),
    total: num(subject.total_cost),
    req: num(subject.window_5h_requests) || num(subject.today_requests),
    tok: num(subject.window_5h_tokens) || num(subject.today_tokens),
  }
}

/** 「加时用量」开关 + 利用率文案。对齐 `extraUsageText`。 */
export function extraUsageText(ex: unknown): string {
  if (!ex || typeof ex !== 'object') return '—'
  const e = ex as Record<string, unknown>
  const on = e.is_enabled ? '开' : '关'
  const u = e.utilization != null ? `${pct(e.utilization).toFixed(0)}%` : '—'
  return `${on} · ${u}${e.status ? ' · ' + String(e.status) : ''}`
}

/**
 * VM 详情页 Fable 卡片所需的完整数据。对齐 `fableCard`。
 * `usedPct` 非空 → 画环形卡（剩余 % + 提示 bits）；
 * 为空 → 画徽标卡（`badgeText` + `badgeCls` + `bits`）。
 */
export function fableCardInfo(
  subject: FableSubject,
  tierKey: string,
  fableCapValue: number
): {
  usedPct: number | null
  reset: string
  bits: string[]
  badgeText: string
  badgeCls: 'ok' | 'warn' | 'bad' | 'none'
} {
  const fb = subject.fable as Record<string, unknown> | undefined
  const used = fableUsedOf(subject, tierKey)
  const reset = String(subject.reset_7d_oi || fb?.reset || '')
  const bits: string[] = [
    `并发 ${num(subject.fable_inflight)}/${num(subject.fable_max) || fableCapValue}`,
  ]
  const coolUntil = num(subject.fable_cooldown_until)
  if (coolUntil && coolUntil > Date.now()) bits.push('冷却中')
  if (fb?.banned) bits.unshift('账号拒')
  else if (fableWeeklyFull(subject, tierKey)) bits.unshift('周额度满')

  if (used != null) {
    return { usedPct: pct(used), reset, bits, badgeText: '', badgeCls: 'ok' }
  }
  const txt = fableProbeLabel(subject, tierKey)
  const pro =
    tierKey === 'pro' || fablePlanDenied(fb) || inventedFableWindow(subject)
  const badgeCls: 'ok' | 'warn' | 'bad' | 'none' = !fb
    ? 'none'
    : pro || fb.banned
      ? 'bad'
      : fb.limited
        ? 'warn'
        : fb.ok
          ? 'ok'
          : 'none'
  const fullBits = [String(fb?.model || 'claude-fable-5'), ...bits]
  if (reset) fullBits.push(fmtReset(reset))
  return { usedPct: null, reset, bits: fullBits, badgeText: txt, badgeCls }
}

/** 周分账（普通半仓 / Fable 半仓）快照。对齐 `splitTracks`/`vdSplitStat`。 */
export function weeklySplitInfo(
  subject: FableSubject
): WeeklySplitSummary | null {
  const s = subject.weekly_split as Record<string, unknown> | undefined
  if (!s?.enabled) return null
  const share = num(s.fable_share) > 0 ? num(s.fable_share) : 0.5
  const regularUsed = num(s.regular_used_weekly)
  const regularRemain = num(s.regular_remain_weekly)
  const fableUsed = num(s.fable_used_weekly)
  const fableRemain = num(s.fable_remain_weekly)
  return {
    share,
    regularUsed,
    regularRemain,
    regularFill: Math.min(100, (regularUsed / share) * 100),
    fableUsed,
    fableRemain,
    fableFill: Math.min(100, (fableUsed / share) * 100),
  }
}
