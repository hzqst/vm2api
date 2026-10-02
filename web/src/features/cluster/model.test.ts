import type { ClusterApiNode } from '@/types/panel-cluster'
import type { Vm } from '@/types/panel-vm'
import { describe, expect, it } from 'vitest'
import {
  buildLocalNode,
  clusterTotals,
  formatNodeMetric,
  remoteNodeFromApi,
  type ClusterNode,
} from '@/features/cluster/model'

function node(
  partial: Partial<ClusterNode> & Pick<ClusterNode, 'id' | 'link'>
): ClusterNode {
  return {
    role: 'remote',
    label: partial.id,
    host: '203.0.113.1',
    latencyMs: null,
    vmCount: 2,
    credCount: 2,
    onlineCredCount: 1,
    spendUsd: 10,
    docker: null,
    ...partial,
  }
}

function api(
  state: ClusterApiNode['link']['state'],
  latency: number | null = null
): ClusterApiNode {
  return {
    id: 'node-1',
    label: 'aws',
    host: '203.0.113.9',
    port: 22,
    username: 'ubuntu',
    auth_type: 'key',
    host_key_alg: 'ssh-ed25519',
    host_key_sha256: 'SHA256:x',
    jump_node_id: null,
    created_at: '',
    updated_at: '',
    link: { state },
    health:
      latency == null
        ? null
        : {
            latency_ms: latency,
            docker: { ok: true, error: null },
            containers: { total: 3, running: 2 },
            checked_at: '',
          },
    bridge: null,
    install: null,
  }
}

describe('formatNodeMetric', () => {
  it('renders dash for unreachable and missing values, not zero', () => {
    expect(formatNodeMetric(node({ id: 'a', link: 'bad' }), 8, String)).toBe(
      '—'
    )
    expect(formatNodeMetric(node({ id: 'b', link: 'none' }), 0, String)).toBe(
      '—'
    )
    expect(formatNodeMetric(node({ id: 'c', link: 'ok' }), null, String)).toBe(
      '—'
    )
    expect(formatNodeMetric(node({ id: 'd', link: 'ok' }), 8, String)).toBe('8')
  })
})

describe('clusterTotals', () => {
  it('counts dead nodes but excludes them from capacity', () => {
    const totals = clusterTotals([
      node({ id: 'live', link: 'ok', vmCount: 8, spendUsd: 12 }),
      node({ id: 'slow', link: 'caution', vmCount: 4, spendUsd: 5 }),
      node({
        id: 'dead',
        link: 'bad',
        vmCount: null,
        credCount: null,
        onlineCredCount: null,
        spendUsd: null,
      }),
    ])
    expect(totals).toEqual({
      nodes: 3,
      reachable: 2,
      unreachable: 1,
      vms: 12,
      creds: 4,
      online: 2,
      spend: 17,
    })
  })
})

describe('buildLocalNode', () => {
  it('counts credentials vs usable credentials from live vms', () => {
    const vms = [
      { id: 'vm-01', has_token: true },
      { id: 'vm-02', has_token: true, availability: { key: 'revoke' } },
      { id: 'vm-03', has_token: false },
    ] as Vm[]
    const local = buildLocalNode({
      host: '127.0.0.1',
      vms,
      spendUsd: 9.5,
      available: true,
    })
    expect(local.link).toBe('ok')
    expect(local.vmCount).toBe(3)
    expect(local.credCount).toBe(2)
    expect(local.onlineCredCount).toBe(1)
    expect(local.spendUsd).toBe(9.5)
  })

  it('leaves node-placed slots and their spend to the node rows', () => {
    const vms = [
      { id: 'vm-01', has_token: true, total_cost: 3 },
      { id: 'vm-02', has_token: true, total_cost: 4, node_id: 'node-1' },
    ] as Vm[]
    const local = buildLocalNode({
      host: 'h',
      vms,
      spendUsd: 7,
      available: true,
    })
    const remote = remoteNodeFromApi(api('ready', 10), vms)
    expect([local.vmCount, local.spendUsd]).toEqual([1, 3])
    expect([remote.vmCount, remote.spendUsd]).toEqual([1, 4])
    expect(clusterTotals([local, remote]).spend).toBe(7)
  })

  it('degrades to none and nulls when dashboard is unavailable', () => {
    const local = buildLocalNode({
      host: 'localhost',
      vms: [{ id: 'vm-01', has_token: true } as Vm],
      spendUsd: 4,
      available: false,
    })
    expect(local.link).toBe('none')
    expect(local.vmCount).toBeNull()
    expect(local.spendUsd).toBeNull()
  })
})

describe('remoteNodeFromApi', () => {
  it('maps link state and latency onto the shared link axis', () => {
    expect(remoteNodeFromApi(api('ready', 300)).link).toBe('ok')
    expect(remoteNodeFromApi(api('ready', 301)).link).toBe('caution')
    expect(remoteNodeFromApi(api('backoff', 40)).link).toBe('bad')
    expect(remoteNodeFromApi(api('error')).link).toBe('bad')
    expect(remoteNodeFromApi(api('connecting')).link).toBe('none')
  })

  it('drops stale latency off ready and keeps non-default ports visible', () => {
    expect(remoteNodeFromApi(api('backoff', 40)).latencyMs).toBeNull()
    expect(remoteNodeFromApi({ ...api('ready', 40), port: 2222 }).host).toBe(
      '203.0.113.9:2222'
    )
  })

  it('reports docker counts only when the node answered', () => {
    expect(remoteNodeFromApi(api('ready', 10)).docker).toEqual({
      running: 2,
      total: 3,
    })
    expect(remoteNodeFromApi(api('connecting')).docker).toBeNull()
  })
})
