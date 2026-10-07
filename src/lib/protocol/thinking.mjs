import { BETA_THINKING_DISPLAY_UPDATES } from './claude-code-betas.mjs'

import {
  normalizeThinkingByPolicy,
  getCapabilities,
  getModelParams,
  clampEnabledThinkingBudget,
  MIN_THINKING_BUDGET,
} from './model-policy.mjs'

export { clampEnabledThinkingBudget, MIN_THINKING_BUDGET }

/**
 * OpenAI reasoning <-> Claude thinking mapping + model-aware normalize.
 * Official (Aug 2026):
 *   Adaptive: Opus 4.6+, Sonnet 4.6+, Opus 4.7/4.8/5, Sonnet 5, Fable 5, Mythos
 *   Manual enabled+budget only: Haiku 4.5, Sonnet/Opus 4.5 and earlier
 *   OAuth (sub2api): Claude 5 / Fable / Opus 4.7+ keep thinking.enabled as-is.
 * Client RikkaHub etc. send adaptive even on Haiku -> 400; convert only there.
 */

const EFFORT_TO_BUDGET = {
  minimal: 1024,
  low: 2048,
  medium: 8192,
  high: 16384,
  xhigh: 32768,
  max: 32768,
}

const DEFAULT_FALLBACK_BUDGET = 4096

export function openaiReasoningToClaudeThinking(body) {
  let effort = body.reasoning_effort
  if (!effort && body.reasoning && typeof body.reasoning === 'object') {
    effort = body.reasoning.effort
  }
  if (!effort) return null

  const e = String(effort).toLowerCase()
  if (e === 'none' || e === 'off') {
    return { type: 'disabled' }
  }

  const budget = EFFORT_TO_BUDGET[e]
  if (budget) {
    return { type: 'enabled', budget_tokens: budget }
  }
  return { type: 'enabled', budget_tokens: EFFORT_TO_BUDGET.medium }
}

export function claudeThinkingToOpenAIReasoning(claude) {
  const texts = []
  for (const b of claude.content || []) {
    if (b.type === 'thinking' && b.thinking) texts.push(b.thinking)
    if (b.type === 'redacted_thinking') texts.push('[redacted_thinking]')
  }
  if (!texts.length) return null
  return texts.join('\n')
}

/** Models that accept thinking.type = "adaptive" */
export function modelSupportsAdaptiveThinking(model = '') {
  const m = String(model || '')
    .toLowerCase()
    .split('[')[0]
  if (!m) return false
  if (m.includes('haiku')) return false
  if (/claude-3[.-]/.test(m)) return false
  // 4.5 family
  if (/claude-(sonnet|opus)-4-5/.test(m)) return false
  if (/claude-(sonnet|opus)-4-202/.test(m)) return false
  // bare claude-sonnet-4 / claude-opus-4 (pre-4.6)
  if (/claude-(sonnet|opus)-4$/.test(m)) return false
  // 4.6+
  if (/claude-(sonnet|opus)-4-[6-9]/.test(m)) return true
  if (/claude-(sonnet|opus)-4\.[6-9]/.test(m)) return true
  // 4.7 / 4.8 opus
  if (/claude-opus-4-[7-9]/.test(m)) return true
  // 5-series + fable/mythos
  if (/claude-(opus|sonnet|fable|mythos)-5/.test(m)) return true
  if (m.includes('fable') || m.includes('mythos')) return true
  return false
}

/** Models that reject thinking.type=enabled (adaptive-only) */
export function modelRequiresAdaptiveThinking(model = '') {
  const m = String(model || '')
    .toLowerCase()
    .split('[')[0]
  if (m.includes('haiku')) return false
  if (/claude-opus-4-[7-9]/.test(m) || /claude-opus-4\.[7-9]/.test(m)) return true
  if (/claude-(opus|sonnet|fable|mythos)-5/.test(m)) return true
  if (m.includes('fable') || m.includes('mythos')) return true
  return false
}

/**
 * Normalize body.thinking for the target model (mutates body).
 * - adaptive on unsupported (Haiku / 4.5) -> enabled + budget (keep thinking intent)
 * - enabled is kept on Claude 5 / Fable / Opus 4.7+ (OAuth passthrough)
 */
export function normalizeThinkingForModel(body = {}) {
  // Prefer model-policy matrix; fall back to hardcoded heuristics if policy unavailable
  try {
    return normalizeThinkingByPolicy(body)
  } catch {
    /* fall through */
  }
  if (!body || typeof body !== 'object') return body
  const thinking = body.thinking
  if (!thinking || typeof thinking !== 'object') return body
  const model = body.model || ''
  const type = String(thinking.type || '').toLowerCase()

  if (type === 'adaptive' && !modelSupportsAdaptiveThinking(model)) {
    const budget = Number(thinking.budget_tokens) > 0 ? Number(thinking.budget_tokens) : DEFAULT_FALLBACK_BUDGET
    body.thinking = { type: 'enabled', budget_tokens: budget }
    return clampEnabledThinkingBudget(body)
  }

  return clampEnabledThinkingBudget(body)
}

const OFFICIAL_THINKING_DISPLAY = 'omitted'

function betaHeaderHas(header, token) {
  if (!header || !token) return false
  return String(header)
    .split(',')
    .map((part) => part.trim())
    .includes(token)
}

/**
 * `updates` requires thinking-display-updates-2026-08-18.
 * Rebuilt setup-token and mimicry headers omit that token, and upstream then
 * 400s unless display is summarized or omitted. Keep `updates` only when the
 * outbound header still declares the beta.
 */
export function downgradeUngatedThinkingDisplay(body = {}, anthropicBetaHeader = '') {
  if (!body || typeof body !== 'object') return body
  const thinking = body.thinking
  if (!thinking || typeof thinking !== 'object') return body
  if (
    String(thinking.display ?? '')
      .trim()
      .toLowerCase() !== 'updates'
  )
    return body
  if (betaHeaderHas(anthropicBetaHeader, BETA_THINKING_DISPLAY_UPDATES)) return body
  return { ...body, thinking: { ...thinking, display: OFFICIAL_THINKING_DISPLAY } }
}

function thinkingNeedsOfficialDisplay(thinking) {
  if (!thinking || typeof thinking !== 'object') return false
  const type = String(thinking.type || '').toLowerCase()
  if (type !== 'adaptive' && type !== 'enabled') return false
  const display = thinking.display
  return display == null || String(display).trim() === ''
}

/** Official 2.1.241 unofficial fill: missing thinking → adaptive+omitted; missing display only → omitted. Never overwrite caller display. */
export function ensureUnofficialAdaptiveThinking(body = {}) {
  if (!body || typeof body !== 'object') return body
  if (body.thinking == null) {
    if (!modelSupportsAdaptiveThinking(body.model)) return body
    return { ...body, thinking: { type: 'adaptive', display: OFFICIAL_THINKING_DISPLAY } }
  }
  if (!thinkingNeedsOfficialDisplay(body.thinking)) return body
  return { ...body, thinking: { ...body.thinking, display: OFFICIAL_THINKING_DISPLAY } }
}

export function modelSupportsEffort(model = '') {
  try {
    return getCapabilities(model)?.supports_effort === true
  } catch {
    const m = String(model || '').toLowerCase()
    if (!m) return false
    if (m.includes('haiku')) return false
    if (/claude-(sonnet|opus)-4-5/.test(m)) return false
    return true
  }
}

/** Haiku / 4.5 reject output_config.effort even with the effort beta. */
export function stripUnsupportedEffort(body = {}) {
  if (!body || typeof body !== 'object') return body
  if (modelSupportsEffort(body.model)) return body
  if (!body.output_config || typeof body.output_config !== 'object') return body
  if (!Object.prototype.hasOwnProperty.call(body.output_config, 'effort')) return body
  const next = { ...body.output_config }
  delete next.effort
  if (Object.keys(next).length === 0) {
    const out = { ...body }
    delete out.output_config
    return out
  }
  return { ...body, output_config: next }
}

/** Official fill: missing output_config.effort. Never overwrite. Opus 5.5 defaults to medium. */
export function ensureUnofficialEffortHigh(body = {}) {
  if (!body || typeof body !== 'object') return body
  if (!modelSupportsEffort(body.model)) return stripUnsupportedEffort(body)
  let effort = 'high'
  try {
    effort = getModelParams(body.model)?.default_effort || 'high'
  } catch {
    effort = 'high'
  }
  if (body.output_config && typeof body.output_config === 'object') {
    if (body.output_config.effort != null && body.output_config.effort !== '') return body
    return { ...body, output_config: { ...body.output_config, effort } }
  }
  return { ...body, output_config: { effort } }
}
