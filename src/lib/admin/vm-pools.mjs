/**
 * Panel-facing vm pool rules. The repo stores rows; this checks names and
 * that every member is a live slot and not already in another pool.
 */
import { VmPoolsRepo } from '../db/repos/vm-pools-repo.mjs'

const NAME_MAX = 40

export function normalizePoolName(value) {
  const name = String(value ?? '').trim()
  if (!name || name.length > NAME_MAX) {
    throw Object.assign(new Error(`账号池名称需要 1–${NAME_MAX} 个字符`), { code: 'invalid_vm_pool_name' })
  }
  return name
}

export function normalizePoolMembers(value, vms) {
  if (value == null) return null
  if (!Array.isArray(value)) {
    throw Object.assign(new Error('vm_ids 必须是数组'), { code: 'invalid_vm_pool_members' })
  }
  const known = new Set((vms || []).map((vm) => vm?.id).filter(Boolean))
  const ids = []
  const seen = new Set()
  for (const item of value) {
    const id = String(item || '').trim()
    if (!id || seen.has(id)) continue
    if (!known.has(id)) {
      throw Object.assign(new Error(`槽位 ${id} 不存在`), { code: 'vm_pool_vm_unknown', vm_id: id })
    }
    seen.add(id)
    ids.push(id)
  }
  return ids
}
export function createVmPool(repo, { name, vm_ids, enabled = true } = {}, vms = []) {
  const ids = vm_ids == null ? null : normalizePoolMembers(vm_ids, vms)
  const pool = repo.insert({ name: normalizePoolName(name), enabled: enabled !== false })
  if (ids == null) return pool
  try {
    return repo.setMembers(pool.id, ids)
  } catch (error) {
    repo.remove(pool.id)
    throw error
  }
}

export function updateVmPool(repo, id, patch = {}, vms = []) {
  let pool = repo.get(id)
  if (!pool) return null
  if (patch.name != null) {
    pool = repo.rename(id, normalizePoolName(patch.name))
  }
  if (patch.enabled != null) {
    if (typeof patch.enabled !== 'boolean') {
      throw Object.assign(new Error('enabled 必须是布尔值'), { code: 'invalid_vm_pool_enabled' })
    }
    pool = repo.setEnabled(id, patch.enabled)
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'vm_ids')) {
    pool = repo.setMembers(id, normalizePoolMembers(patch.vm_ids, vms))
  }
  return pool
}

export function deleteVmPool(repo, id) {
  if (!repo.get(id)) return { ok: false, error: 'vm_pool_not_found' }
  const keys = repo.countKeys(id)
  if (keys > 0) {
    return { ok: false, error: 'vm_pool_in_use', keys }
  }
  repo.remove(id)
  return { ok: true }
}

export function vmPoolHttpStatus(code) {
  if (code === 'vm_pool_not_found') return 404
  if (
    code === 'vm_pool_in_use' ||
    code === 'vm_in_other_pool' ||
    code === 'vm_pool_name_taken' ||
    code === 'key_exists'
  ) {
    return 409
  }
  return 400
}

export function assertVmPoolExists(repo, id) {
  if (!id) return
  if (!repo.get(id)) {
    throw Object.assign(new Error('账号池不存在'), { code: 'vm_pool_unknown' })
  }
}

export function vmPoolsFor(db) {
  return new VmPoolsRepo(db)
}
