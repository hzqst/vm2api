import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const { buildProbeOne, buildVmDetail } = await import('../../src/lib/admin/panel-api.mjs')
const { AccountQuota } = await import('../../src/lib/pool/account-quota.mjs')
const { createDatabase } = await import('../../src/lib/db/database.mjs')

function fixture(t, { mode = 'setup-token', headers = true, failed = false } = {}) {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-card-'))
  fs.mkdirSync(path.join(project, 'vms'))
  fs.writeFileSync(
    path.join(project, 'vms/vm-02.json'),
    JSON.stringify({
      id: 'vm-02',
      status: 'stopped',
      claude: { mode, has_access: true, account_uuid: 'account-test' },
      policy: { maxConcurrency: 20, sessionSlots: 20 },
    }),
  )
  const dataDir = path.join(project, 'data')
  let db = createDatabase({ dataDir })
  let quota = new AccountQuota({ db })
  const acc = quota.ensure({ account_id: 'account-test', vm_id: 'vm-02', max_concurrency: 20 })
  acc.unified.headers = headers
    ? { '5h': { utilization: 0.15, status: 'allowed' }, sampled_at: '2026-09-20T00:00:00Z' }
    : {}
  if (failed) {
    acc.unified.last_probe = {
      at: '2026-09-21T00:00:00Z',
      source: 'official-cc-usage',
      ok: false,
      error: 'invalid_grant',
    }
    acc.unified.usage_rate_limited_until = '2099-01-01T00:00:00Z'
  }
  quota.repo.save(acc)
  t.after(() => {
    db.close()
    fs.rmSync(project, { recursive: true, force: true })
  })
  const args = { cfg: { paths: { project }, rewrite: {} }, id: 'vm-02', force: true, hop: true }
  return {
    quota,
    args,
    reopen() {
      db.close()
      db = createDatabase({ dataDir })
      quota = new AccountQuota({ db })
      return quota
    },
    async detail(q = quota) {
      return (await buildVmDetail({ ...args, accountQuota: q })).data
    },
  }
}

test('Setup Token probe persists the card check time/source across DB reopen and detail reload', async (t) => {
  const f = fixture(t)
  const result = (await buildProbeOne({ ...f.args, accountQuota: f.quota })).data
  assert.equal(result.ok, true)
  assert.equal(result.source, 'messages-headers')
  const detail = await f.detail(f.reopen())
  assert.equal(detail.account.last_probe_check?.at, result.probed_at)
  assert.equal(detail.account.last_probe_check.source, result.source)
  assert.equal(detail.account.last_probe_check.via, 'passive-headers')
  assert.equal(detail.account.last_probe_check.data_at, '2026-09-20T00:00:00Z')
  assert.deepEqual(detail.vm.last_probe_check, detail.account.last_probe_check)
})

test('cached-header check preserves active-probe failures, backoff, quota and counters', async (t) => {
  const f = fixture(t, { failed: true })
  const before = f.quota.repo.get('account-test')
  await buildProbeOne({ ...f.args, accountQuota: f.quota })
  const after = f.quota.repo.get('account-test')
  assert.equal(after.unified.last_probe_check?.ok, true)
  const { last_probe_check, ...unified } = after.unified
  assert.deepEqual(unified, before.unified)
  assert.equal(after.requests, before.requests)
  assert.equal(after.max_concurrency, 20)
})

test('no header samples reports unavailable and persists the attempt without fake success', async (t) => {
  const f = fixture(t, { headers: false })
  const result = (await buildProbeOne({ ...f.args, accountQuota: f.quota })).data
  assert.equal(result.ok, false)
  assert.match(result.error, /暂无.*响应头/)
  const check = (await f.detail()).account.last_probe_check
  assert.equal(check.at, result.probed_at)
  assert.equal(check.ok, false)
  assert.equal(check.data_at, null)
  assert.equal(f.quota.repo.get('account-test').unified.last_probe, undefined)
})

test('Setup Token probe marks Max when the Fable hop succeeds and does not keep the Pro badge', async (t) => {
  const f = fixture(t)
  f.quota.setAccountTier('account-test', 'pro')
  const result = (
    await buildProbeOne({
      ...f.args,
      accountQuota: f.quota,
      fableProbe: async () => ({
        tier: 'max',
        fable: { ok: true, status: 200, model: 'claude-fable-5-1', plan_denied: false },
      }),
    })
  ).data
  assert.equal(result.account_tier, 'max')
  assert.equal(f.quota.repo.get('account-test').unified.account_tier, 'max')
  assert.equal(f.quota.repo.get('account-test').unified.usage_has_fable, true)
  assert.equal(f.quota.repo.get('account-test').unified.fable.plan_denied, false)
  const detail = await f.detail(f.reopen())
  assert.equal(detail.vm.account_tier, 'max')
})

test('official OAuth probe still ingests real usage and exposes its actual result to the card', async (t) => {
  const f = fixture(t, { mode: 'oauth' })
  const probe = {
    ok: false,
    source: 'official-cc-usage',
    via: 'worker',
    error: 'probe_failed',
    probed_at: '2026-09-24T00:00:00Z',
  }
  const result = (
    await buildProbeOne({
      ...f.args,
      accountQuota: f.quota,
      usageCache: {
        clear() {},
        async load() {
          return probe
        },
      },
    })
  ).data
  assert.equal(result.ok, false)
  const detail = await f.detail(f.reopen())
  assert.equal(detail.account.last_probe_check?.at, probe.probed_at)
  assert.equal(detail.account.last_probe_check.ok, false)
  assert.equal(detail.account.last_probe_check.error, 'probe_failed')
  assert.equal(detail.account.last_probe.error, 'probe_failed')
})
