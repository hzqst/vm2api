/**
 * SQL predicates over `usage_logs` shared by every reader (legacy request-log
 * repo, scrolling log view, statistics). Columns are unqualified: callers query
 * `usage_logs` without joins and resolve display names separately.
 */

import { ignoredErrorSqlList, slaOkErrorSqlList } from '../../admin/error-class.mjs'
import { OPENAI_OFFICIAL_RATES } from '../../admin/openai-pricing.mjs'

const IGNORED_CODES_SQL = ignoredErrorSqlList()
const SLA_OK_CODES_SQL = slaOkErrorSqlList()

export const ERROR_PRED = `(status >= 400 OR (error_code IS NOT NULL AND error_code != '' AND error_code NOT IN (${IGNORED_CODES_SQL})))`
export const SUCCESS_PRED = `(status < 400 AND (error_code IS NULL OR error_code = '' OR error_code IN (${IGNORED_CODES_SQL})))`
const SLA_OK_PRED = `(status = 429 OR (error_code IS NOT NULL AND error_code != '' AND error_code IN (${SLA_OK_CODES_SQL})))`
export const SLA_SUCCESS_PRED = `(${SUCCESS_PRED} OR ${SLA_OK_PRED})`
export const SLA_ERROR_PRED = `(${ERROR_PRED} AND NOT (${SLA_OK_PRED}))`

// Per-row prompt size for cache hit rate; the SQL twin of admin/cache-metrics.mjs.
// Codex keeps OpenAI's inclusive input count. Anthropic stores disjoint input,
// cache-read and cache-write counts, even when called through an OpenAI endpoint.
// Prefer the recorded route, with model fallbacks for historical logs. Compute
// each row's prompt before SUM so a user/key mixing providers stays weighted by tokens.
const CACHE_MODEL_SQL = `LOWER(TRIM(COALESCE(
  NULLIF(NULLIF(pricing_model, ''), 'unpriced'), NULLIF(upstream_model, ''),
  NULLIF(model, ''), requested_model, ''
)))`
const OPENAI_MODELS_SQL = Object.keys(OPENAI_OFFICIAL_RATES)
  .map((id) => `'${id.replaceAll("'", "''")}'`)
  .join(', ')
// API non-streaming Anthropic replies persist the converted body's disjoint
// usage, including when the upstream model is OpenAI. Streaming API and Codex
// logs instead retain raw upstream usage. Use these persisted route fields
// before model fallbacks so existing converted logs need no billing rewrite.
export const PROMPT_TOKENS_SQL = `CASE
  WHEN via = 'api-kernel' AND protocol = 'anthropic.messages' AND stream = 0
  THEN IFNULL(input_tokens, 0) + IFNULL(cache_read_tokens, 0) + IFNULL(cache_creation_tokens, 0)
  WHEN via LIKE 'codex-%'
    OR (${CACHE_MODEL_SQL} LIKE 'gpt%' AND ${CACHE_MODEL_SQL} NOT LIKE 'gpt-image%')
    OR ${CACHE_MODEL_SQL} LIKE 'codex-%'
    OR ${CACHE_MODEL_SQL} IN (${OPENAI_MODELS_SQL})
  THEN IFNULL(input_tokens, 0)
  ELSE IFNULL(input_tokens, 0) + IFNULL(cache_read_tokens, 0) + IFNULL(cache_creation_tokens, 0)
END`

/** Rows a panel `user` owns: own user_id, one of their live keys, or one of their slots. */
export function ownerPred(ownerUserId) {
  const id = String(ownerUserId || '').trim()
  if (!id) return { sql: '', params: [] }
  return {
    sql: `(user_id = ? OR IFNULL(api_key_id, '') IN (SELECT id FROM api_keys WHERE user_id = ? AND deleted_at IS NULL) OR IFNULL(vm_id, '') IN (SELECT id FROM vms WHERE owner_user_id = ?))`,
    params: [id, id, id],
  }
}
