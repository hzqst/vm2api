import type { ClusterApiNode } from '@/types/panel-cluster'
import type { Dashboard } from '@/types/panel-overview'
import type { UsagePayload } from '@/types/panel-usage'
import type { Vm } from '@/types/panel-vm'
import type { StatusTone } from '@/types/status'
import { accountUsable } from '@/lib/vm-status'

/** 与代理页同一条 300ms 线：超过就从「已连接」降到「延迟高」。 */
export const LINK_LATENCY_WARN_MS = 300

export type ClusterLink = 'ok' | 'caution' | 'bad' | 'none'

export type ClusterNode = {
  id: string
  role: 'local' | 'remote'
  label: string
  host: string
  link: ClusterLink
  latencyMs: number | null
  vmCount: number | null
  credCount: number | null
  onlineCredCount: number | null
  spendUsd: number | null
  /** 远端 Docker 容器数（含 egress）；本机不统计为 null。 */
  docker: { running: number; total: number } | null
  /** 远端节点的原始控制面记录；本机为空。 */
  remote?: ClusterApiNode
}

export type ClusterTotals = {
  nodes: number
  reachable: number
  unreachable: number
  vms: number
  creds: number
  online: number
  spend: number
}

export const LINK_TONE: Record<ClusterLink, StatusTone> = {
  ok: { key: 'ok', cls: 'ok', text: '已连接', label: '已连接' },
  caution: { key: 'caution', cls: 'caution', text: '延迟高', label: '延迟高' },
  bad: { key: 'bad', cls: 'bad', text: '不可达', label: '不可达' },
  none: { key: 'none', cls: 'none', text: '未接入', label: '未接入' },
}

export function isLiveLink(link: ClusterLink): boolean {
  return link === 'ok' || link === 'caution'
}

export function formatNodeMetric(
  node: Pick<ClusterNode, 'link'> & { [key: string]: unknown },
  value: number | null,
  format: (n: number) => string
): string {
  if (!isLiveLink(node.link) || value == null || !Number.isFinite(value)) {
    return '—'
  }
  return format(value)
}

export function clusterTotals(nodes: ClusterNode[]): ClusterTotals {
  const live = nodes.filter((node) => isLiveLink(node.link))
  const add = (key: 'vmCount' | 'credCount' | 'onlineCredCount' | 'spendUsd') =>
    live.reduce((sum, node) => sum + (Number(node[key]) || 0), 0)
  return {
    nodes: nodes.length,
    reachable: live.length,
    unreachable: nodes.filter((node) => node.link === 'bad').length,
    vms: add('vmCount'),
    creds: add('credCount'),
    online: add('onlineCredCount'),
    spend: add('spendUsd'),
  }
}

export function localSpendUsd(
  dash: Dashboard | undefined,
  usage: UsagePayload | undefined
): number {
  return Number(
    dash?.billing?.total?.total_cost ??
      usage?.billing?.total?.total_cost ??
      usage?.totals?.total_cost ??
      dash?.summary?.total_cost ??
      0
  )
}

/** 一组槽位（本机或某节点）的计数与累计花费；归属按 `node_id`。 */
export function slotStats(vms: Vm[]) {
  return {
    vmCount: vms.length,
    credCount: vms.filter((vm) => vm.has_token).length,
    onlineCredCount: vms.filter((vm) => accountUsable(vm)).length,
    spendUsd: vms.reduce((sum, vm) => sum + (Number(vm.total_cost) || 0), 0),
  }
}

export function buildLocalNode(input: {
  host: string
  vms: Vm[] | undefined
  spendUsd: number
  available: boolean
}): ClusterNode {
  if (!input.available) {
    return {
      id: 'local',
      role: 'local',
      label: '本机',
      host: input.host,
      link: 'none',
      latencyMs: null,
      vmCount: null,
      credCount: null,
      onlineCredCount: null,
      spendUsd: null,
      docker: null,
    }
  }
  const all = input.vms || []
  // 账单总额含节点槽位；节点行各自计入，本机只留差额，合计不重复。
  const remoteSpend = slotStats(all.filter((vm) => !!vm.node_id)).spendUsd
  return {
    id: 'local',
    role: 'local',
    label: '本机',
    host: input.host,
    link: 'ok',
    latencyMs: 0,
    ...slotStats(all.filter((vm) => !vm.node_id)),
    spendUsd: Math.max(0, input.spendUsd - remoteSpend),
    docker: null,
  }
}

export const LINK_STATE_TEXT: Record<ClusterApiNode['link']['state'], string> =
  {
    idle: '未启动',
    connecting: '连接中',
    ready: '已连接',
    backoff: '重连等待',
    error: '已停止',
  }

/**
 * 链路轴：ready 按延迟分 ok / caution；backoff 与 error 是不可达；
 * connecting / idle 还没有结论，记 none。
 */
export function remoteLink(node: ClusterApiNode): ClusterLink {
  const state = node.link.state
  if (state === 'ready') {
    const lat = node.health?.latency_ms
    return lat != null && lat > LINK_LATENCY_WARN_MS ? 'caution' : 'ok'
  }
  if (state === 'backoff' || state === 'error') return 'bad'
  return 'none'
}

/** 节点行：链路来自控制面，槽位 / 凭证 / 花费来自 `node_id` 归属的 VM。 */
export function remoteNodeFromApi(
  node: ClusterApiNode,
  vms: Vm[] | undefined = []
): ClusterNode {
  const counts = node.health?.containers
  return {
    id: node.id,
    role: 'remote',
    label: node.label,
    host: node.port === 22 ? node.host : `${node.host}:${node.port}`,
    link: remoteLink(node),
    latencyMs:
      node.link.state === 'ready' ? (node.health?.latency_ms ?? null) : null,
    ...slotStats((vms || []).filter((vm) => vm.node_id === node.id)),
    docker:
      counts && counts.total != null
        ? { running: Number(counts.running) || 0, total: counts.total }
        : null,
    remote: node,
  }
}
