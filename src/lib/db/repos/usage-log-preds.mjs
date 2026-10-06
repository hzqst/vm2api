/**
 * SQL predicates over `usage_logs` shared by every reader (legacy request-log
 * repo, scrolling log view, statistics). Columns are unqualified: callers query
 * `usage_logs` without joins and resolve display names separately.
 */

import { ignoredErrorSqlList, slaOkErrorSqlList } from '../../admin/error-class.mjs'

const IGNORED_CODES_SQL = ignoredErrorSqlList()
const SLA_OK_CODES_SQL = slaOkErrorSqlList()

export const ERROR_PRED = `(status >= 400 OR (error_code IS NOT NULL AND error_code != '' AND error_code NOT IN (${IGNORED_CODES_SQL})))`
export const SUCCESS_PRED = `(status < 400 AND (error_code IS NULL OR error_code = '' OR error_code IN (${IGNORED_CODES_SQL})))`
const SLA_OK_PRED = `(status = 429 OR (error_code IS NOT NULL AND error_code != '' AND error_code IN (${SLA_OK_CODES_SQL})))`
export const SLA_SUCCESS_PRED = `(${SUCCESS_PRED} OR ${SLA_OK_PRED})`
export const SLA_ERROR_PRED = `(${ERROR_PRED} AND NOT (${SLA_OK_PRED}))`

/** Rows a panel `user` owns: own user_id, one of their live keys, or one of their slots. */
export function ownerPred(ownerUserId) {
  const id = String(ownerUserId || '').trim()
  if (!id) return { sql: '', params: [] }
  return {
    sql: `(user_id = ? OR IFNULL(api_key_id, '') IN (SELECT id FROM api_keys WHERE user_id = ? AND deleted_at IS NULL) OR IFNULL(vm_id, '') IN (SELECT id FROM vms WHERE owner_user_id = ?))`,
    params: [id, id, id],
  }
}
