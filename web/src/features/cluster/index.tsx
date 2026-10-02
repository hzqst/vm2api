import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { VIEW_TITLES } from '@/config/nav'
import type { Vm } from '@/types/panel-vm'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { fmtNum, fmtUsd } from '@/lib/format'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { PageHeader } from '@/components/page-header'
import { QueryGate, errorMessage } from '@/components/query-gate'
import { StatCard } from '@/components/stat-card'
import { meQueryOptions } from '@/features/auth/queries'
import { ClusterSkeleton } from '@/features/cluster/cluster-skeleton'
import { JoinVpsDialog } from '@/features/cluster/join-dialog'
import { LocalBoard } from '@/features/cluster/local-board'
import {
  buildLocalNode,
  clusterTotals,
  localSpendUsd,
  remoteNodeFromApi,
  type ClusterNode,
} from '@/features/cluster/model'
import {
  CLUSTER_NODES_KEY,
  clusterLocalQueryOptions,
  clusterNodesQueryOptions,
} from '@/features/cluster/queries'
import { RemoteList } from '@/features/cluster/remote-list'
import { SshPanel } from '@/features/cluster/ssh-panel'
import {
  dashboardQueryOptions,
  usageQueryOptions,
} from '@/features/overview/queries'

export function ClusterPage() {
  const qc = useQueryClient()
  const dash = useQuery(dashboardQueryOptions(5000))
  const usage = useQuery(usageQueryOptions(15000))
  const me = useQuery(meQueryOptions())
  const cluster = useQuery(clusterNodesQueryOptions())
  const localLink = useQuery(clusterLocalQueryOptions())
  const canManage = me.data?.role === 'admin'
  const apiNodes = useMemo(() => cluster.data || [], [cluster.data])
  const dashVms = useMemo(() => (dash.data?.vms || []) as Vm[], [dash.data])
  const remotes = useMemo(
    () => apiNodes.map((n) => remoteNodeFromApi(n, dashVms)),
    [apiNodes, dashVms]
  )
  const [joinOpen, setJoinOpen] = useState(false)
  const [panelId, setPanelId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<ClusterNode | null>(null)
  const panelNode = apiNodes.find((n) => n.id === panelId) || null

  const remove = useMutation({
    mutationFn: (id: string) =>
      api(`/api/panel/cluster/nodes/${id}`, { method: 'DELETE' }),
    onSuccess: (_data, id) => {
      toast.success('已移除节点')
      if (panelId === id) setPanelId(null)
      qc.invalidateQueries({ queryKey: CLUSTER_NODES_KEY })
    },
    onError: (err) => toast.error(err.message),
  })

  const hostName =
    typeof window === 'undefined' ? 'local' : window.location.hostname
  const dashReady = !!dash.data && !dash.data.error && !dash.error
  const local = useMemo(
    () =>
      buildLocalNode({
        host: hostName,
        vms: dashVms,
        spendUsd: localSpendUsd(dash.data, usage.data),
        available: dashReady,
      }),
    [dash.data, dashVms, dashReady, hostName, usage.data]
  )
  const nodes = useMemo(() => [local, ...remotes], [local, remotes])
  const totals = clusterTotals(nodes)
  const reachableTone =
    local.link === 'bad'
      ? 'bad'
      : local.link === 'none' || totals.unreachable > 0
        ? 'caution'
        : 'neutral'

  return (
    <PageHeader
      title={VIEW_TITLES.cluster}
      extra={
        canManage ? (
          <Button onClick={() => setJoinOpen(true)}>接入 VPS</Button>
        ) : undefined
      }
    >
      <span
        className='hidden'
        aria-hidden
        dangerouslySetInnerHTML={{
          __html: `<!--
THESIS: Cluster is host topology, not a slot list. Local VPS is the instrument; remotes are SSH reachability.
OWN-WORLD: Graphite Operate console. Teal only on primary action. StatusMark is the only health language.
FIRST VIEWPORT: Local board with live slot/cred/spend and host meters; remotes wait below as a connection list.
SIGNATURE: IP as identity, link as StatusMark, dead nodes render em-dash not zero.
ANTI-PATTERN: Equal SaaS server cards, VM fleet filters, nested cards, decorative maps.
-->`,
        }}
      />
      <QueryGate
        loading={dash.isLoading && !dash.data}
        error={null}
        skeleton={<ClusterSkeleton />}
      >
        <div className='space-y-3'>
          {dash.error || dash.data?.error ? (
            <Alert variant='destructive'>
              <AlertTitle>本机指标加载失败</AlertTitle>
              <AlertDescription>
                {errorMessage(
                  dash.error || new Error(String(dash.data?.error))
                )}
              </AlertDescription>
            </Alert>
          ) : null}
          {cluster.error ? (
            <Alert variant='destructive'>
              <AlertTitle>节点列表加载失败</AlertTitle>
              <AlertDescription>{errorMessage(cluster.error)}</AlertDescription>
            </Alert>
          ) : null}

          <div className='grid grid-cols-2 gap-3 xl:grid-cols-5'>
            <StatCard label='节点' value={fmtNum(totals.nodes)} />
            <StatCard
              label='可达'
              value={`${fmtNum(totals.reachable)} / ${fmtNum(totals.nodes)}`}
              tone={reachableTone}
            />
            <StatCard label='槽位' value={fmtNum(totals.vms)} />
            <StatCard label='在线凭证' value={fmtNum(totals.online)} />
            <div className='col-span-2 xl:col-span-1'>
              <StatCard label='总花费' value={fmtUsd(totals.spend, 2)} />
            </div>
          </div>

          <LocalBoard
            node={local}
            host={dashReady ? dash.data?.host : undefined}
            link={localLink.data}
            linkError={localLink.error}
            outbound={{
              ready: apiNodes.filter((n) => n.link.state === 'ready').length,
              total: apiNodes.length,
            }}
          />

          <RemoteList
            nodes={remotes}
            canManage={canManage}
            onJoin={() => setJoinOpen(true)}
            onOpen={(node) => setPanelId(node.id)}
            onDisconnect={setDropTarget}
          />
        </div>
      </QueryGate>

      <JoinVpsDialog
        open={joinOpen}
        onOpenChange={setJoinOpen}
        nodes={apiNodes}
        onJoined={(node) => {
          qc.invalidateQueries({ queryKey: CLUSTER_NODES_KEY })
          setPanelId(node.id)
        }}
      />
      <SshPanel
        node={panelNode}
        nodes={apiNodes}
        onOpenChange={(open) => {
          if (!open) setPanelId(null)
        }}
      />
      <ConfirmDialog
        open={!!dropTarget}
        onOpenChange={(open) => {
          if (!open) setDropTarget(null)
        }}
        title='移除节点'
        desc={
          dropTarget
            ? `${dropTarget.label} · ${dropTarget.host}。断开 SSH、删除本地凭证与 Docker 桥；远端容器保持运行。`
            : ''
        }
        confirmText='移除'
        cancelBtnText='取消'
        destructive
        handleConfirm={() => {
          if (!dropTarget) return
          remove.mutate(dropTarget.id)
          setDropTarget(null)
        }}
      />
    </PageHeader>
  )
}
