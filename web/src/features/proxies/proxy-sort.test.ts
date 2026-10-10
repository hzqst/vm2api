import { describe, expect, it } from 'vitest'
import {
  proxiesForVmBind,
  proxyLabel,
  proxyMatchesQuery,
  sortedProxies,
  sortedProxiesByAvailability,
} from './proxy-sort'

const base = { id: 'px-1', host: '1.2.3.4', port: 1080 }

describe('proxyLabel', () => {
  it('puts the proxy name before the endpoint', () => {
    expect(proxyLabel({ ...base, label: '东京-2' })).toBe(
      '东京-2 · 1.2.3.4:1080'
    )
  })

  it('falls back to the bare endpoint when unnamed or blank', () => {
    expect(proxyLabel(base)).toBe('1.2.3.4:1080')
    expect(proxyLabel({ ...base, label: '   ' })).toBe('1.2.3.4:1080')
    expect(proxyLabel({ ...base, label: null })).toBe('1.2.3.4:1080')
  })
})

describe('local proxy', () => {
  const local = {
    id: 'px-local',
    host: 'local',
    port: 0,
    scheme: 'local',
    kind: 'local',
    enabled: true,
    // Worse on every column: pinning must not depend on health, seats or latency.
    status: 'fail',
    latency_ms: 900,
    bound_vm_ids: ['vm-1', 'vm-2', 'vm-3', 'vm-4', 'vm-5'],
  }
  const socks = [
    { ...base, id: 'px-a', status: 'ok', latency_ms: 10, enabled: true },
    {
      ...base,
      id: 'px-b',
      host: '5.6.7.8',
      status: 'ok',
      latency_ms: 5,
      enabled: true,
    },
  ]

  it('is labelled with the VPS it exits from', () => {
    expect(proxyLabel(local, '203.0.113.7')).toBe(
      'local:203.0.113.7 · 当前VPS的本地代理'
    )
    expect(proxyLabel(local)).toBe('local:当前VPS · 当前VPS的本地代理')
  })

  it('stays first in every ordering', () => {
    const list = [...socks, local]
    expect(sortedProxiesByAvailability(list, 'vm-9', 5)[0].id).toBe('px-local')
    for (const key of ['status', 'latency', 'seats', 'geo', 'host'] as const) {
      for (const dir of ['asc', 'desc'] as const) {
        expect(sortedProxies(list, key, dir)[0].id).toBe('px-local')
      }
    }
  })
})

describe('proxiesForVmBind', () => {
  const local = {
    id: 'px-local',
    host: 'local',
    port: 0,
    scheme: 'local' as const,
    kind: 'local' as const,
    enabled: true,
    status: 'ok' as const,
    bind_limit: 8,
    bound_vm_ids: ['vm-14', 'vm-16'],
  }
  const socks = {
    ...base,
    enabled: true,
    status: 'ok' as const,
    bind_limit: 8,
    bound_vm_ids: [] as string[],
  }

  it('keeps the local proxy when this slot already uses it', () => {
    const list = proxiesForVmBind([socks, local], 'vm-14', 5)
    expect(list.map((p) => p.id)).toEqual(['px-local', 'px-1'])
  })

  it('drops a full proxy that belongs to other slots', () => {
    const full = {
      ...socks,
      id: 'px-full',
      bind_limit: 1,
      bound_vm_ids: ['vm-01'],
    }
    const list = proxiesForVmBind([full, local], 'vm-03', 5)
    expect(list.map((p) => p.id)).toEqual(['px-local'])
  })
})

describe('proxyMatchesQuery', () => {
  it('finds a proxy by its name', () => {
    const prx = { ...base, label: 'Tokyo Box' }
    expect(proxyMatchesQuery(prx, 'tokyo', () => '')).toBe(true)
    expect(proxyMatchesQuery(prx, 'osaka', () => '')).toBe(false)
  })
})
