import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Vm, VmQuotaOverride, VmQuotaView } from '@/types/panel-vm'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { dashboardQueryOptions } from '@/features/overview/queries'
import {
  IDLE_STEPS,
  RATIO_STEPS,
  SESSION_STEPS,
} from '@/features/settings/quota-tier-pane'
import { vmQueryOptions } from '@/features/vm/queries'

type Key = keyof VmQuotaView
type Kind = 'ratio' | 'sessions' | 'idle' | 'bool'

/** 与 settings/quota 的字段一一对应；并发 / RPM 走「并发 / RPM」编辑。 */
const FIELDS: { key: Key; label: string; kind: Kind }[] = [
  { key: 'limit_5h', label: '5h 硬闸', kind: 'ratio' },
  { key: 'limit_7d', label: '7d 硬闸', kind: 'ratio' },
  { key: 'max_sessions', label: '最大会话', kind: 'sessions' },
  { key: 'session_idle_min', label: '会话空闲', kind: 'idle' },
  { key: 'block_on_5h', label: '5h 打满阻断', kind: 'bool' },
  { key: 'block_on_7d', label: '7d 打满阻断', kind: 'bool' },
  { key: 'weekly_split', label: '周仓拆分', kind: 'bool' },
]

const INHERIT = 'inherit'

function fmtValue(kind: Kind, value: unknown): string {
  if (kind === 'bool') return value ? '开' : '关'
  const n = Number(value)
  if (kind === 'ratio') return `${Math.round(n * 100)}%`
  if (kind === 'sessions') return n > 0 ? String(n) : '不限制'
  return IDLE_STEPS.find(([v]) => v === n)?.[1] || `${n} 分钟`
}

/** 编辑态用字符串：ratio 存百分数，bool 存 on/off。 */
function toDraft(kind: Kind, value: unknown): string {
  if (value == null) return INHERIT
  if (kind === 'bool') return value ? 'on' : 'off'
  if (kind === 'ratio') return String(Math.round(Number(value) * 100))
  return String(Number(value))
}

function fromDraft(kind: Kind, draft: string): number | boolean | null {
  if (draft === INHERIT) return null
  if (kind === 'bool') return draft === 'on'
  if (kind === 'ratio') return Number(draft) / 100
  return Number(draft)
}

function options(kind: Kind, draft: string): [string, string][] {
  const base: [string, string][] =
    kind === 'bool'
      ? [
          ['on', '开'],
          ['off', '关'],
        ]
      : kind === 'ratio'
        ? RATIO_STEPS.map((p): [string, string] => [String(p), `${p}%`])
        : kind === 'sessions'
          ? SESSION_STEPS.map((v): [string, string] => [
              String(v),
              v === 0 ? '不限制' : String(v),
            ])
          : IDLE_STEPS.map(([v, l]): [string, string] => [String(v), l])
  // 服务端存了不在档位里的值（手改 vm.json）时保留它，不被吞成别的档。
  if (draft === INHERIT || base.some(([v]) => v === draft)) return base
  const label =
    kind === 'ratio' ? `${draft}%` : kind === 'idle' ? `${draft} 分钟` : draft
  return [...base, [draft, label] as [string, string]].sort(
    (a, b) => Number(a[0]) - Number(b[0])
  )
}

function draftsOf(override: VmQuotaOverride | null | undefined) {
  return Object.fromEntries(
    FIELDS.map(({ key, kind }) => [key, toDraft(kind, override?.[key])])
  ) as Record<Key, string>
}

/** 「运行」栏里的配额块：逐项显示生效值，覆盖项高亮，编辑弹窗与全局配额同构。 */
export function VmQuotaField({ vm }: { vm: Vm }) {
  const policy = vm.quota_policy
  const inherited = vm.quota_inherited
  const override = vm.quota_override || {}
  if (!policy || !inherited) return null
  const custom = FIELDS.filter(({ key }) => override[key] != null).length

  return (
    <div className='rounded-md border border-primary/30 bg-primary/5 px-2.5 py-2'>
      <div className='flex items-center justify-between gap-2'>
        <div className='min-w-0'>
          <div className='text-xs font-medium'>配额</div>
          <div
            className={cn(
              'text-[11px]',
              custom ? 'text-primary' : 'text-muted-foreground'
            )}
          >
            {custom ? `本槽覆盖 ${custom} 项` : '跟随全局，点右侧修改'}
          </div>
        </div>
        <VmQuotaEditor vm={vm} />
      </div>
      <div className='mt-2 grid grid-cols-2 gap-1.5'>
        {FIELDS.map(({ key, label, kind }) => {
          const own = override[key] != null
          return (
            <div
              key={key}
              className={cn(
                'flex min-w-0 items-baseline justify-between gap-2 rounded border px-2 py-1 text-xs',
                own
                  ? 'border-primary/40 bg-background'
                  : 'border-border/70 bg-background/60'
              )}
              title={
                own ? `全局 ${fmtValue(kind, inherited[key])}` : '跟随全局'
              }
            >
              <span className='truncate text-muted-foreground'>{label}</span>
              <span
                className={cn(
                  'shrink-0 whitespace-nowrap tabular-nums',
                  own && 'font-medium text-primary'
                )}
              >
                {fmtValue(kind, policy[key])}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function VmQuotaEditor({ vm }: { vm: Vm }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(() => draftsOf(vm.quota_override))
  const inherited = vm.quota_inherited

  const save = useMutation({
    mutationFn: (body: VmQuotaOverride | null) =>
      api(`/api/panel/vms/${encodeURIComponent(vm.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ quota_override: body }),
      }),
    onSuccess: async (_data, body) => {
      toast.success(body ? '槽位配额已热更新' : '槽位配额已恢复全局')
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['panel', 'vms'] }),
        qc.invalidateQueries({ queryKey: vmQueryOptions(vm.id).queryKey }),
        qc.invalidateQueries({ queryKey: dashboardQueryOptions().queryKey }),
      ])
      setOpen(false)
    },
    onError: (error: Error) => toast.error(error.message || '更新失败'),
  })

  if (!inherited) return null

  const submit = () => {
    const body: VmQuotaOverride = {}
    for (const { key, kind } of FIELDS) {
      const v = fromDraft(kind, draft[key])
      if (v != null) (body as Record<string, unknown>)[key] = v
    }
    save.mutate(Object.keys(body).length ? body : null)
  }

  return (
    <>
      <Button
        size='sm'
        className='h-7 shrink-0 px-2.5 text-xs shadow-sm'
        onClick={() => {
          setDraft(draftsOf(vm.quota_override))
          setOpen(true)
        }}
      >
        编辑配额
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!save.isPending) setOpen(v)
        }}
      >
        <DialogContent className='sm:max-w-lg'>
          <DialogHeader>
            <DialogTitle>槽位配额</DialogTitle>
            <DialogDescription>
              只作用于本槽位，热更新不进容器。选「跟随全局」的项随 设置 → 配额
              变化；过 5h/7d 硬闸写入受限并切号，不是调度关。
            </DialogDescription>
          </DialogHeader>
          <div className='grid gap-4 sm:grid-cols-2'>
            {FIELDS.map(({ key, label, kind }) => (
              <div key={key} className='space-y-1.5'>
                <Label
                  htmlFor={`vm-quota-${key}`}
                  className='flex items-center justify-between'
                >
                  {label}
                  {draft[key] !== INHERIT ? (
                    <span className='text-[11px] font-normal text-primary'>
                      本槽
                    </span>
                  ) : null}
                </Label>
                <Select
                  value={draft[key]}
                  onValueChange={(v) => setDraft({ ...draft, [key]: v })}
                  disabled={save.isPending}
                >
                  <SelectTrigger
                    id={`vm-quota-${key}`}
                    className={cn(
                      'w-full',
                      draft[key] !== INHERIT && 'border-primary/60 bg-primary/5'
                    )}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={INHERIT}>
                      跟随全局（{fmtValue(kind, inherited[key])}）
                    </SelectItem>
                    {options(kind, draft[key]).map(([v, l]) => (
                      <SelectItem key={v} value={v}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          <DialogFooter className='sm:justify-between'>
            <Button
              size='sm'
              variant='outline'
              disabled={save.isPending || !vm.quota_override}
              onClick={() => save.mutate(null)}
            >
              全部恢复全局
            </Button>
            <div className='flex gap-2'>
              <Button
                size='sm'
                variant='outline'
                disabled={save.isPending}
                onClick={() => setOpen(false)}
              >
                取消
              </Button>
              <Button size='sm' disabled={save.isPending} onClick={submit}>
                {save.isPending ? '保存中…' : '保存'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
