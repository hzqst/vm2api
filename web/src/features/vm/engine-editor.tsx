import { useMemo, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { Vm, VmKernelSnapshot } from '@/types/panel-vm'
import { toast } from 'sonner'
import { patchVm } from '@/lib/api'
import { isCodexVm } from '@/lib/vm-kind'
import { Button } from '@/components/ui/button'
import { dashboardQueryOptions } from '@/features/overview/queries'
import {
  DATAPLANE_HINT,
  HOP_TRANSPORT_LABEL,
  dataplaneLabel,
} from '@/features/vm/dataplane-contract'
import {
  DEFAULT_RESOLVED_ENGINE,
  inferenceEngineLabel,
  inferenceEnginePatchValue,
  normalizeInferenceEngine,
} from '@/features/vm/engine-contract'
import { isRemoteVm, REMOTE_UNSUPPORTED_TEXT } from '@/features/vm/placement'
import { vmQueryOptions } from '@/features/vm/queries'

export function VmEngineEditor({
  id,
  vm,
  kernel,
}: {
  id: string
  vm: Vm
  kernel?: VmKernelSnapshot | null
}) {
  const qc = useQueryClient()
  const configured = normalizeInferenceEngine(
    kernel?.configured_engine ?? vm.inference_engine,
    'auto'
  )
  const resolved = normalizeInferenceEngine(
    kernel?.resolved_engine ?? vm.resolved_inference_engine,
    DEFAULT_RESOLVED_ENGINE
  )
  const active = normalizeInferenceEngine(
    kernel?.active_engine ?? vm.runtime?.engine,
    resolved
  )
  const inherits = configured === 'auto'
  const remote = isRemoteVm(vm)
  const status = useMemo(
    () => ({
      configured: inferenceEngineLabel(configured),
      resolved: inferenceEngineLabel(resolved),
      active: inferenceEngineLabel(active),
    }),
    [active, configured, resolved]
  )
  const inherit = useMutation({
    mutationFn: () =>
      patchVm(id, { inference_engine: inferenceEnginePatchValue('auto') }),
    onSuccess: async () => {
      toast.success('推理内核已改为跟随设置 → 协议')
      await Promise.all([
        qc.invalidateQueries({ queryKey: vmQueryOptions(id).queryKey }),
        qc.invalidateQueries({ queryKey: dashboardQueryOptions().queryKey }),
      ])
    },
    onError: (error: Error) =>
      toast.error(`恢复跟随全局失败：${error.message}`),
  })

  return (
    <CardSection title='推理内核'>
      <div className='grid gap-2 text-sm sm:grid-cols-3'>
        <EngineValue label='已配置' value={status.configured} />
        <EngineValue label='解析后' value={status.resolved} />
        <EngineValue label='当前运行' value={status.active} />
      </div>
      <div className='mt-3 grid gap-2 text-sm sm:grid-cols-2'>
        <EngineValue
          label='数据面'
          value={isCodexVm(vm) ? '—' : dataplaneLabel(vm.resolved_dataplane)}
        />
      </div>
      <p className='mt-3 text-xs leading-relaxed text-muted-foreground'>
        运输固定 {HOP_TRANSPORT_LABEL}。{DATAPLANE_HINT} 数据面在{' '}
        <Link to='/wrap' className='underline underline-offset-4'>
          内核页
        </Link>{' '}
        或{' '}
        <Link
          to='/settings/$tab'
          params={{ tab: 'protocol' }}
          className='underline underline-offset-4'
        >
          设置 → 协议
        </Link>
        切换。Go HTTP 转发不再启用。
      </p>
      {inherits ? null : (
        <Button
          className='mt-3'
          variant='outline'
          disabled={inherit.isPending || remote}
          onClick={() => inherit.mutate()}
        >
          {inherit.isPending ? '恢复中…' : '恢复跟随全局'}
        </Button>
      )}
      {remote ? (
        <p className='mt-2 text-xs text-muted-foreground'>
          切换推理内核：{REMOTE_UNSUPPORTED_TEXT}
        </p>
      ) : null}
    </CardSection>
  )
}

function CardSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className='rounded-md border p-4'>
      <h3 className='mb-3 text-sm font-medium'>{title}</h3>
      {children}
    </section>
  )
}

function EngineValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className='text-xs text-muted-foreground'>{label}</div>
      <div className='mt-1 font-medium'>{value}</div>
    </div>
  )
}
