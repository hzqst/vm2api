import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UsageAccountRow } from '@/types/panel-usage'
import type { Vm } from '@/types/panel-vm'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { dashboardQueryOptions } from '@/features/overview/queries'
import { clearVmRestriction } from '@/features/vm/clear-restriction'
import { vmQueryOptions, vmsListQueryOptions } from '@/features/vm/queries'
import {
  VmActionsContext,
  type VmActions,
} from '@/features/vm/vm-actions-context'
import { VmDetailCard } from '@/features/vm/vm-detail-card'
import { VmReauthDialog } from '@/features/vm/vm-reauth-dialog'
import { VmStatsDialog } from '@/features/vm/vm-stats-dialog'
import { VmTestDialog } from '@/features/vm/vm-test-dialog'

/**
 * 持有详情卡与测试 / 统计 / 重新授权弹窗的开关，行与卡片只发「打开哪台」。
 * 弹窗内的 Vm 始终从列表缓存里按 id 取，轮询刷新后卡面数据同步更新。
 */
export function VmActionsProvider({
  accounts,
  onReset,
  onDelete,
  children,
}: {
  accounts?: UsageAccountRow[]
  onReset?: (vm: Vm) => void
  onDelete?: (vm: Vm) => void
  children: React.ReactNode
}) {
  const qc = useQueryClient()
  const list = useQuery(vmsListQueryOptions())
  const [detailId, setDetailId] = useState<string | null>(null)
  const [testId, setTestId] = useState<string | null>(null)
  const [statsId, setStatsId] = useState<string | null>(null)
  const [reauthId, setReauthId] = useState<string | null>(null)
  const items = list.data?.items
  const byId = (id: string | null) =>
    (id && items?.find((vm) => vm.id === id)) || null

  const invalidate = (vm: Vm) =>
    Promise.all([
      qc.invalidateQueries({ queryKey: vmsListQueryOptions().queryKey }),
      qc.invalidateQueries({ queryKey: vmQueryOptions(vm.id).queryKey }),
      qc.invalidateQueries({ queryKey: dashboardQueryOptions().queryKey }),
    ])

  const {
    mutate: refreshToken,
    isPending: refreshPending,
    variables: refreshVars,
  } = useMutation({
    mutationFn: (vm: Vm) =>
      api(`/api/panel/vms/${encodeURIComponent(vm.id)}/oauth/refresh`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: async (_data, vm) => {
      toast.success(`已刷新令牌 ${vm.id}`)
      await invalidate(vm)
    },
    onError: (error: Error) => toast.error(error.message),
  })
  const {
    mutate: recoverState,
    isPending: recoverPending,
    variables: recoverVars,
  } = useMutation({
    mutationFn: (vm: Vm) => clearVmRestriction(vm),
    onSuccess: async (_data, vm) => {
      toast.success('已清除冷却 / 熔断并刷新状态')
      await invalidate(vm)
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const actions = useMemo<VmActions>(
    () => ({
      openDetail: (vm) => setDetailId(vm.id),
      openTest: (vm) => setTestId(vm.id),
      openStats: (vm) => setStatsId(vm.id),
      openReauth: (vm) => setReauthId(vm.id),
      refreshToken,
      recover: recoverState,
      refreshingId: refreshPending ? (refreshVars?.id ?? null) : null,
      recoveringId: recoverPending ? (recoverVars?.id ?? null) : null,
      reset: onReset,
      remove: onDelete,
    }),
    [
      refreshToken,
      recoverState,
      refreshPending,
      refreshVars,
      recoverPending,
      recoverVars,
      onReset,
      onDelete,
    ]
  )

  return (
    <VmActionsContext.Provider value={actions}>
      {children}
      <VmDetailCard
        vm={byId(detailId)}
        accounts={accounts}
        onOpenChange={(open) => !open && setDetailId(null)}
      />
      <VmTestDialog
        vm={byId(testId)}
        onOpenChange={(open) => !open && setTestId(null)}
      />
      <VmStatsDialog
        vm={byId(statsId)}
        accounts={accounts}
        onOpenChange={(open) => !open && setStatsId(null)}
      />
      <VmReauthDialog
        vm={byId(reauthId)}
        onOpenChange={(open) => !open && setReauthId(null)}
      />
    </VmActionsContext.Provider>
  )
}
