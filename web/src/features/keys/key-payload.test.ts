import { describe, expect, it } from 'vitest'
import { keyLimitsPayload, type KeyLimitsDraft } from './key-payload'

const draft: KeyLimitsDraft = {
  name: ' ops ',
  category: 'api',
  max_concurrency: 4,
  quota_requests: 12,
  quota_usd: 3.5,
  rpm: 60,
  expires_in_days: 30,
  group_type: 'anthropic',
  allowed_vms: ['vm-01', 'vm-01', ' '],
}

describe('API key limit payload', () => {
  it('keeps request and USD quotas separate', () => {
    expect(keyLimitsPayload(draft, 'create')).toEqual({
      name: 'ops',
      category: 'api',
      max_concurrency: 4,
      quota_requests: 12,
      quota_usd: 3.5,
      rpm: 60,
      expires_in_days: 30,
      group_type: 'anthropic',
      allowed_vms: ['vm-01'],
    })
  })

  it('omits create-only fields from edits and rejects invalid quotas', () => {
    expect(keyLimitsPayload(draft, 'edit')).not.toHaveProperty('name')
    expect(keyLimitsPayload(draft, 'edit')).not.toHaveProperty(
      'expires_in_days'
    )
    expect(() =>
      keyLimitsPayload({ ...draft, quota_requests: 1.5 }, 'create')
    ).toThrow('请求额度')
    expect(() =>
      keyLimitsPayload({ ...draft, quota_usd: -1 }, 'create')
    ).toThrow('USD 额度')
    expect(
      keyLimitsPayload(
        { ...draft, group_type: 'all', allowed_vms: ['vm-01'] },
        'create'
      )
    ).toMatchObject({
      group_type: 'all',
      allowed_vms: [],
    })
    expect(() =>
      keyLimitsPayload({ ...draft, allowed_vms: [] }, 'create')
    ).toThrow('至少选择一台 VM')
  })
})
