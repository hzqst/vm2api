import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildUsage, indexBillingAccounts, lookupBilling } from '../../src/lib/admin/panel-api.mjs'

test('billing index keeps UUID row when leftover vm-id account is empty', () => {
  const leftover = {
    account_id: 'vm-50',
    vm_id: 'vm-50',
    today_requests: 0,
    today_cache_read_tokens: 0,
    requests: 0,
    today_cost: 0,
  }
  const real = {
    account_id: '7667b68b-3351-4bc9-b06e-39d6795b3019',
    vm_id: 'vm-50',
    today_requests: 243,
    today_cache_read_tokens: 24757802,
    requests: 245,
    today_cost: 24.45,
  }
  const index = indexBillingAccounts({ accounts: [real, leftover] })
  const vm = { id: 'vm-50', account_uuid: real.account_id }
  const leftoverAcc = { account_id: 'vm-50', vm_id: 'vm-50' }
  assert.equal(lookupBilling(index, vm), real)
  assert.equal(lookupBilling(index, leftoverAcc), real)
  assert.equal(lookupBilling(index, { id: 'vm-50' }), real)
})

test('billing rows of an older account on a reused slot keep their own email', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kin-billing-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const billing = {
    accounts: [
      { account_id: 'old-uuid', vm_id: 'vm-02', total_cost: 9, email: 'old@example.com' },
      { account_id: 'new-uuid', vm_id: 'vm-02', total_cost: 1 },
      { vm_id: 'vm-03', total_cost: 1 },
    ],
  }
  const accountQuota = {
    snapshot: () => ({
      accounts: [
        { account_id: 'new-uuid', vm_id: 'vm-02', email: 'new@example.com' },
        { account_id: 'vm3-uuid', vm_id: 'vm-03', email: 'three@example.com' },
      ],
    }),
  }
  const usage = buildUsage({
    accountQuota,
    cfg: { paths: { project: root } },
    requestLog: { billingStats: () => billing },
  })
  const emails = usage.data.billing.accounts.map((row) => row.email)
  assert.deepEqual(emails, ['old@example.com', 'new@example.com', 'three@example.com'])
})
