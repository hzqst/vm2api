import type { UsageLogRow } from '@/types/panel-usage-logs'

/** Gate order matches `evaluateProtocolIntercept`: cheap rules first, the model last. */
export type StageId = 'distill' | 'hard-regex' | 'refusal' | 'jev'
export type ViewKey = 'all' | StageId | 'pass'

export const STAGES: { id: StageId; name: string; does: string }[] = [
  {
    id: 'distill',
    name: '蒸馏',
    does: '收割模板、结构特征、题目指纹。命中即 403，并封 device。',
  },
  {
    id: 'hard-regex',
    name: '硬正则',
    does: '按类别正则扫用户正文。命中即 403，不 hop。',
  },
  {
    id: 'refusal',
    name: '拒答缓存',
    does: '上游拒过的正文、近似正文和被封的 device，直接 503。',
  },
  {
    id: 'jev',
    name: '决策模型',
    does: '把正文交给安全模型逐题打分，低于阈值就拦。',
  },
]

export const VIEW_KEYS: ViewKey[] = ['all', ...STAGES.map((s) => s.id), 'pass']

export function isViewKey(value: unknown): value is ViewKey {
  return typeof value === 'string' && VIEW_KEYS.includes(value as ViewKey)
}

export const PASS_REASONS: Record<string, { label: string; hint: string }> = {
  jev: { label: '模型判安全', hint: '决策模型打过分' },
  regex: { label: '正则未命中', hint: '决策模型关闭或跳过' },
  'fail-open': { label: '模型故障放行', hint: '打分失败，按失败放行出站' },
  unchecked: { label: '未检查', hint: '没有任何规则在跑' },
  unknown: {
    label: '未经关卡',
    hint: '鉴权、请求体等错误在关卡前结束，或升级前的旧日志',
  },
}

/** `upstream` = passed every gate and the upstream refused it. */
export type FeedKind = StageId | 'upstream'

export function feedKindOf(row: UsageLogRow): FeedKind {
  const state = row.finalState || ''
  const via = row.via || ''
  if (state === 'distill_blocked' || via === 'distill-detect') return 'distill'
  if (via === 'hard-regex') return 'hard-regex'
  if (via === 'jev') return 'jev'
  if (state.startsWith('refusal_') || via === 'refusal-guard') return 'refusal'
  return 'upstream'
}

const REFUSAL_MATCH: Record<string, string> = {
  refusal_guard: '精确指纹',
  refusal_similar: '近似正文',
  refusal_device: '封禁 device',
}

/** The part of the stored block message that says why: `nsfw: 关键词`. */
export function evidenceOf(row: UsageLogRow): string {
  const kind = feedKindOf(row)
  if (kind === 'refusal') return REFUSAL_MATCH[row.finalState || ''] || '拒答'
  const text = String(row.errorMessage || row.blockedReason || '').trim()
  if (kind === 'upstream') return text
  const at = text.search(/[:：]/)
  return at >= 0 ? text.slice(at + 1).trim() : text
}

export function share(part: number, whole: number) {
  if (!whole || !part) return '0%'
  const value = (part / whole) * 100
  if (value < 0.1) return '<0.1%'
  return `${value < 10 ? value.toFixed(1) : Math.round(value)}%`
}
