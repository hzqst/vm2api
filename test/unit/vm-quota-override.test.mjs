import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { AccountQuota } from '../../src/lib/pool/account-quota.mjs'
import { parseVmQuotaOverride } from '../../src/lib/pool/vm-quota-override.mjs'

function quota() {
  return new AccountQuota({
    dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'kin-vm-quota-')),
    config: {
      quota: { block_on_5h: true, block_on_7d: true },
      tiers: { default: { limit_5h: 0.85, limit_7d: 0.8, max_concurrency: 4 } },
    },
    accounts: [
      { account_id: 'acc-a', vm_id: 'vm-a' },
      { account_id: 'acc-b', vm_id: 'vm-b' },
    ],
  })
}

function setUtil(q, accountId, u5, u7 = 0.1) {
  q.ingestHeaders(
    accountId,
    {
      'anthropic-ratelimit-unified-5h-utilization': String(u5),
      'anthropic-ratelimit-unified-7d-utilization': String(u7),
      'anthropic-ratelimit-unified-5h-reset': new Date(Date.now() + 3600_000).toISOString(),
    },
    {},
  )
}

test('VM 5h threshold override only moves that VM gate', () => {
  const q = quota()
  q.setVmQuotaOverride('vm-a', { limit_5h: 0.95 })
  setUtil(q, 'acc-a', 0.9)
  setUtil(q, 'acc-b', 0.9)
  assert.equal(q.canAccept('acc-a').ok, true)
  assert.equal(q.canAccept('acc-b').reason, 'quota_5h_safety')
})

test('VM block switch off lets the slot run past its threshold; clearing restores global', () => {
  const q = quota()
  setUtil(q, 'acc-a', 0.9)
  q.setVmQuotaOverride('vm-a', { block_on_5h: false })
  assert.equal(q.canAccept('acc-a').ok, true)
  q.setVmQuotaOverride('vm-a', null)
  assert.equal(q.canAccept('acc-a').reason, 'quota_5h_safety')
})

test('VM session override 0 disables a tier session cap', () => {
  const q = new AccountQuota({
    dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'kin-vm-quota-')),
    config: { quota: {}, tiers: { default: { max_sessions: 1 } } },
    accounts: [{ account_id: 'acc-a', vm_id: 'vm-a' }],
  })
  assert.equal(q.canAccept('acc-a', { sessionKey: 's1' }).ok, true)
  q.sessions.touch('acc-a', 's1')
  assert.equal(q.canAccept('acc-a', { sessionKey: 's2' }).reason, 'session_limit')
  q.loadVmQuotaOverrides([{ id: 'vm-a', quota_override: { max_sessions: 0 } }])
  assert.equal(q.policyFor(q.repo.get('acc-a')).max_sessions, 0)
  assert.equal(q.canAccept('acc-a', { sessionKey: 's2' }).ok, true)
})

test('parseVmQuotaOverride rejects out-of-range and unknown fields, null field follows global', () => {
  assert.deepEqual(parseVmQuotaOverride({ limit_5h: 0.9, max_sessions: null }), {
    ok: true,
    value: { limit_5h: 0.9 },
  })
  assert.deepEqual(parseVmQuotaOverride({ limit_5h: null }), { ok: true, value: null })
  assert.equal(parseVmQuotaOverride({ limit_5h: 0.2 }).ok, false)
  assert.equal(parseVmQuotaOverride({ session_idle_min: 0 }).ok, false)
  assert.equal(parseVmQuotaOverride({ block_on_5h: 'yes' }).ok, false)
  assert.equal(parseVmQuotaOverride({ max_concurrency: 4 }).ok, false)
})
