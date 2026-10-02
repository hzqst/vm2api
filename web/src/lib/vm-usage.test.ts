import type { Vm } from '@/types/panel-vm'
import { describe, expect, it } from 'vitest'
import { billingRowSlot } from '@/lib/vm-usage'

describe('billingRowSlot', () => {
  const byId = new Map<string, Vm>([
    ['vm-02', { id: 'vm-02', account_uuid: 'new', email: 'new@example.com' }],
    ['vm-05', { id: 'vm-05' }],
  ])

  it('gives a reused slot id only to its bound account', () => {
    expect(
      billingRowSlot({ account_id: 'new', vm_id: 'vm-02' }, byId)?.id
    ).toBe('vm-02')
    expect(
      billingRowSlot({ account_id: 'old', vm_id: 'vm-02' }, byId)
    ).toBeUndefined()
  })

  it('keeps the slot when its bound account is unknown', () => {
    expect(
      billingRowSlot({ account_id: 'any', vm_id: 'vm-05' }, byId)?.id
    ).toBe('vm-05')
  })

  it('has no slot for deleted slots or rows without one', () => {
    expect(
      billingRowSlot({ account_id: 'x', vm_id: 'vm-09' }, byId)
    ).toBeUndefined()
    expect(billingRowSlot({ account_id: 'x' }, byId)).toBeUndefined()
  })
})
