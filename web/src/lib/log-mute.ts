import type { ErrorOwner } from '@/types/panel-logs'

const LS_LOG_MUTE = 'kin_log_muted_classes'

/** 后端 `ERROR_CLASSES` 的完整镜像（`error-class.mjs`）。label 是后端权威中文，改动需同步。 */
export const ERROR_CLASS_META: Record<
  string,
  { label: string; owner: ErrorOwner }
> = {
  auth: { label: '认证', owner: 'client' },
  request: { label: '请求格式', owner: 'client' },
  signature: { label: '思考签名', owner: 'client' },
  rate_limit: { label: '限流', owner: 'provider' },
  quota: { label: '额度', owner: 'platform' },
  overloaded: { label: '过载排队', owner: 'provider' },
  unavailable: { label: '无可用账号', owner: 'platform' },
  timeout: { label: '超时', owner: 'provider' },
  credential: { label: '凭证', owner: 'platform' },
  proxy: { label: '代理', owner: 'platform' },
  upstream: { label: '上游', owner: 'provider' },
  other: { label: '其它', owner: 'platform' },
  distill: { label: '蒸馏拦截', owner: 'platform' },
  refusal: { label: '拒答拦截', owner: 'provider' },
}

export const ERROR_CLASS_IDS = Object.keys(ERROR_CLASS_META)

/** 后端 `DEFAULT_MUTED_ERROR_CLASSES`：字段缺失时的回落值。 */
export const DEFAULT_MUTED_CLASSES = ['auth']

/**
 * SQL 层只能真正排除 `auth`（`error-class.mjs` 的 `excludeErrorClassSql`）——
 * `error_class` 是读出后派生的，不是 DB 列。屏蔽其余类时后端只在内存删当页行，
 * 导致 `total` 偏大、每页条数不足。UI 需为此标注计数近似。
 */
export function isExactlyMutable(id: string): boolean {
  return id === 'auth'
}

/** 当前屏蔽集里是否含 SQL 层排除不掉的类 → 计数需标注「近似」。 */
export function hasApproximateCount(muted: string[]): boolean {
  return muted.some((id) => !isExactlyMutable(id))
}

function normalize(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : String(raw ?? '').split(',')
  const seen = new Set<string>()
  for (const item of list) {
    const id = String(item).trim()
    if (id && id in ERROR_CLASS_META) seen.add(id)
  }
  return [...seen]
}

function readLocal(): string[] | null {
  try {
    const raw = localStorage.getItem(LS_LOG_MUTE)
    if (raw == null) return null
    const parsed: unknown = JSON.parse(raw)
    return normalize(parsed)
  } catch {
    return null
  }
}

/**
 * 三级回退读取屏蔽列表：localStorage → 服务端快照 → 默认 `['auth']`。
 *
 * 服务端的 `muted_error_classes` **可能整个 key 缺失**（`routing.json` 里没这个字段），
 * 那种情况下必须回落 `['auth']` 而不是 `[]` —— 显式 `[]` 是「不屏蔽任何类」的另一种状态。
 */
export function resolveMutedClasses(
  serverValue?: string[] | null | undefined
): string[] {
  const local = readLocal()
  if (local) return local
  if (serverValue != null) return normalize(serverValue)
  return [...DEFAULT_MUTED_CLASSES]
}

export function writeMutedClasses(classes: string[]): void {
  try {
    localStorage.setItem(LS_LOG_MUTE, JSON.stringify(normalize(classes)))
  } catch {
    /* localStorage 不可用时静默降级为纯内存 */
  }
}

/**
 * 掩码入站 Key。后端**不掩码**，只截断到 240 字符，且值是攻击者可控字符串。
 * 保留前 8 后 4 便于运维比对，中间恒定替换。
 *
 * 调用方仍需遵守：不放进 `title=`、不给复制按钮、不写 console / toast。
 */
export function maskPresentedKey(raw: unknown): string {
  const value = String(raw ?? '').trim()
  if (!value) return '—'
  if (value.length <= 14) return '••••••••'
  return `${value.slice(0, 8)}••••••••${value.slice(-4)}`
}
