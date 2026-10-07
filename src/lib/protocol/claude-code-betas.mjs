/**
 * Claude Code OAuth beta sets, aligned with sub2api claude/constants.go.
 *
 * KIN only overwrites VM identity (device / account / stainless).
 * Protocol betas follow sub2api:
 *   official + client beta → passthrough (plus oauth if missing, minus 1M by matrix)
 *   official + empty       → DefaultBetaHeader / HaikuBetaHeader
 *   unofficial / mimic     → FullClaudeCodeMimicryBetas (Haiku: HAIKU_BETA_HEADER), never context-1m
 */
export const BETA_OAUTH = 'oauth-2025-04-20'
export const BETA_CLAUDE_CODE = 'claude-code-20250219'
export const BETA_INTERLEAVED = 'interleaved-thinking-2025-05-14'
export const BETA_FINE_GRAINED_TOOLS = 'fine-grained-tool-streaming-2025-05-14'
export const BETA_THINKING_TOKEN_COUNT = 'thinking-token-count-2026-05-13'
export const BETA_PROMPT_CACHING_SCOPE = 'prompt-caching-scope-2026-01-05'
export const BETA_MID_CONVERSATION_SYSTEM = 'mid-conversation-system-2026-04-07'
export const BETA_MID_CONVERSATION_SYSTEM_CLEAR_AT = 'mid-conversation-system-clear-at-2026-08-21'
export const BETA_MID_CONVERSATION_TOOL_CHANGES = 'mid-conversation-tool-changes-2026-07-01'
export const BETA_ADVANCED_TOOL_USE = 'advanced-tool-use-2025-11-20'
export const BETA_THINKING_BINDING_CONTROLS = 'thinking-binding-controls-2026-08-01'
export const BETA_EFFORT = 'effort-2025-11-24'
export const BETA_EXTENDED_CACHE_TTL = 'extended-cache-ttl-2025-04-11'
export const BETA_CACHE_DIAGNOSIS = 'cache-diagnosis-2026-04-07'
export const BETA_CONTEXT_MANAGEMENT = 'context-management-2025-06-27'
export const BETA_FALLBACK_CREDIT = 'fallback-credit-2026-06-01'
export const BETA_CONTEXT_1M = 'context-1m-2025-08-07'
/** Gates thinking.display=updates. Absent from rebuilt setup-token and mimicry headers. */
export const BETA_THINKING_DISPLAY_UPDATES = 'thinking-display-updates-2026-08-18'

export const HAIKU_BETA_HEADER = `${BETA_OAUTH},${BETA_INTERLEAVED}`

/**
 * Claude Code 2.1.281 official main Messages order (linux-x64 sdk-cli, no context-1m).
 * advanced-tool-use is back, next to mid-conversation-system-clear-at.
 * thinking-binding-controls stays. extended-cache-ttl and cache-diagnosis are on the wire.
 * mid-conversation-tool-changes and fallback-credit are not in this capture.
 */
export function fullClaudeCodeMimicryBetas() {
  return [
    BETA_CLAUDE_CODE,
    BETA_OAUTH,
    BETA_INTERLEAVED,
    BETA_THINKING_TOKEN_COUNT,
    BETA_CONTEXT_MANAGEMENT,
    BETA_PROMPT_CACHING_SCOPE,
    BETA_MID_CONVERSATION_SYSTEM,
    BETA_ADVANCED_TOOL_USE,
    BETA_MID_CONVERSATION_SYSTEM_CLEAR_AT,
    BETA_EFFORT,
    BETA_THINKING_BINDING_CONTROLS,
    BETA_EXTENDED_CACHE_TTL,
    BETA_CACHE_DIAGNOSIS,
  ]
}

export const DEFAULT_BETA_HEADER = fullClaudeCodeMimicryBetas().join(',')

export function defaultOfficialBetaHeader(modelId = '') {
  return /haiku/i.test(String(modelId || '')) ? HAIKU_BETA_HEADER : DEFAULT_BETA_HEADER
}

export function joinBetas(tokens = []) {
  return [...tokens].filter(Boolean).join(',')
}

export const API_KEY_BETAS = [BETA_CLAUDE_CODE, BETA_INTERLEAVED, BETA_FINE_GRAINED_TOOLS]

export function stripOauthBeta(header = '') {
  return String(header || '')
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p && p !== BETA_OAUTH)
    .join(',')
}

export function apiKeyBetaHeader(header = '') {
  const stripped = stripOauthBeta(header)
  return stripped || API_KEY_BETAS.join(',')
}

/** Setup Token runtime uses the inference-compatible beta set. Claude Code session betas 401 it. */
export function setupTokenBetaHeader(modelId = '') {
  if (/haiku/i.test(String(modelId || ''))) return HAIKU_BETA_HEADER
  return joinBetas([BETA_OAUTH, BETA_INTERLEAVED, BETA_CONTEXT_MANAGEMENT])
}

/** Merge required mimicry tokens into an existing beta header, preserving order. */
export function ensureMimicryBetas(header = '', required = DEFAULT_BETA_HEADER) {
  const have = String(header || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const seen = new Set(have)
  for (const token of String(required || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)) {
    if (!seen.has(token)) {
      have.push(token)
      seen.add(token)
    }
  }
  return have.join(',')
}

/** sub2api getBetaHeader: official client list must contain oauth-2025-04-20. */
export function ensureOauthBeta(header = '') {
  const parts = String(header || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  if (!parts.length) return header
  if (parts.includes(BETA_OAUTH)) return parts.join(',')
  const idx = parts.indexOf(BETA_CLAUDE_CODE)
  if (idx >= 0) {
    parts.splice(idx + 1, 0, BETA_OAUTH)
    return parts.join(',')
  }
  return [BETA_OAUTH, ...parts].join(',')
}
