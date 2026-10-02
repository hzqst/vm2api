/**
 * Per-VM quota override layered over the global quota settings.
 *
 * Stored at `vm.policy.quota`. Every field is optional: absent = follow the
 * global value (`tiers.<tier>.*` for thresholds/sessions, `quota.*` for the
 * block switches and weekly split). Concurrency / RPM keep their own pins
 * (`policy.maxConcurrency` / `policy.maxRpm`).
 */
import { weeklySplitConfig } from './weekly-split.mjs'

const FIELDS = {
  limit_5h: { kind: 'ratio' },
  limit_7d: { kind: 'ratio' },
  max_sessions: { kind: 'int', min: 0, max: 256 },
  session_idle_min: { kind: 'int', min: 1, max: 1440 },
  block_on_5h: { kind: 'bool' },
  block_on_7d: { kind: 'bool' },
  weekly_split: { kind: 'bool' },
}

export const VM_QUOTA_FIELDS = Object.keys(FIELDS)

function parseField(key, value) {
  const spec = FIELDS[key]
  if (spec.kind === 'bool') {
    return typeof value === 'boolean' ? { ok: true, value } : { ok: false, error: `${key} must be a boolean` }
  }
  const n = typeof value === 'number' ? value : Number.NaN
  if (spec.kind === 'ratio') {
    if (!Number.isFinite(n) || n < 0.3 || n > 1) return { ok: false, error: `${key} must be a ratio from 0.3 to 1` }
    return { ok: true, value: n }
  }
  if (!Number.isInteger(n) || n < spec.min || n > spec.max) {
    return { ok: false, error: `${key} must be an integer from ${spec.min} to ${spec.max}` }
  }
  return { ok: true, value: n }
}

/**
 * Strict parse of a panel PATCH `quota_override` body.
 * `null` clears every override; a `null` field follows the global value.
 * @returns {{ ok: true, value: object | null } | { ok: false, error: string }}
 */
export function parseVmQuotaOverride(raw) {
  if (raw == null) return { ok: true, value: null }
  if (typeof raw !== 'object' || Array.isArray(raw))
    return { ok: false, error: 'quota_override must be an object or null' }
  const out = {}
  for (const [key, value] of Object.entries(raw)) {
    if (!Object.hasOwn(FIELDS, key)) return { ok: false, error: `quota_override.${key} is not supported` }
    if (value == null) continue
    const parsed = parseField(key, value)
    if (!parsed.ok) return { ok: false, error: `quota_override.${parsed.error}` }
    out[key] = parsed.value
  }
  return { ok: true, value: Object.keys(out).length ? out : null }
}

/** Lenient read of the stored record: hand-edited invalid fields fall back to the global value. */
export function vmQuotaOverrideOf(vm) {
  const raw = vm?.policy?.quota
  if (!raw || typeof raw !== 'object') return null
  const out = {}
  for (const key of VM_QUOTA_FIELDS) {
    if (raw[key] == null) continue
    const parsed = parseField(key, raw[key])
    if (parsed.ok) out[key] = parsed.value
  }
  return Object.keys(out).length ? out : null
}

/** Tier policy (`resolveTierPolicy`) with the VM's thresholds / session window applied. */
export function applyVmQuotaPolicy(policy, override) {
  if (!override) return policy
  const next = { ...policy }
  if (override.limit_5h != null) {
    next.limit_5h = override.limit_5h
    next.safety_ratio = override.limit_5h
    if (Number(next.warn_ratio) > override.limit_5h) next.warn_ratio = override.limit_5h
  }
  if (override.limit_7d != null) {
    next.limit_7d = override.limit_7d
    next.weekly_safety_ratio = override.limit_7d
  }
  if (override.max_sessions != null) next.max_sessions = override.max_sessions
  if (override.session_idle_min != null) next.session_idle_min = override.session_idle_min
  return next
}

/** Global `quota` block with the VM's block switches / weekly split applied. */
export function applyVmQuotaConfig(quota, override) {
  const base = quota && typeof quota === 'object' ? quota : {}
  if (!override) return base
  const next = { ...base }
  if (override.block_on_5h != null) next.block_on_5h = override.block_on_5h
  if (override.block_on_7d != null) next.block_on_7d = override.block_on_7d
  if (override.weekly_split != null) {
    next.weekly_split = {
      ...(base.weekly_split && typeof base.weekly_split === 'object' ? base.weekly_split : {}),
      enabled: override.weekly_split,
    }
  }
  return next
}

/** Panel view of the fields a VM can override, resolved from a policy + quota block. */
export function vmQuotaView(policy, quota) {
  return {
    limit_5h: Number(policy?.limit_5h ?? policy?.safety_ratio ?? 0.85),
    limit_7d: Number(policy?.limit_7d ?? policy?.weekly_safety_ratio ?? 0.8),
    max_sessions: Number(policy?.max_sessions ?? 0),
    session_idle_min: Number(policy?.session_idle_min ?? 5),
    block_on_5h: quota?.block_on_5h !== false,
    block_on_7d: quota?.block_on_7d !== false,
    weekly_split: weeklySplitConfig(quota || {}).enabled,
  }
}
