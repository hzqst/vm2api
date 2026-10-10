import { useQuery } from '@tanstack/react-query'
import type { VmProxySnap } from '@/types/panel-vm'
import { meQueryOptions } from '@/features/auth/queries'
import { clusterNodesQueryOptions } from '@/features/cluster/queries'
import { proxyIsLocal } from './proxy-sort'

/**
 * 本地代理在某台 VPS 上的出口 IP，用来标 `local:<IP>`。
 * 节点槽：节点地址（节点列表仅 admin / super 可读）；本机槽：本地代理行测地理得到的出口 IP。
 * 拿不到返回 null，文案退回「当前VPS」。
 */
export function useVpsIp(
  nodeId: string | null | undefined,
  pool: VmProxySnap[]
): string | null {
  const me = useQuery(meQueryOptions())
  const canReadNodes = me.data?.role === 'admin' || me.data?.role === 'super'
  const nodes = useQuery({
    ...clusterNodesQueryOptions(),
    refetchInterval: false,
    enabled: canReadNodes && !!nodeId,
  })
  if (nodeId) return nodes.data?.find((n) => n.id === nodeId)?.host || null
  return pool.find(proxyIsLocal)?.geo?.ip || null
}
