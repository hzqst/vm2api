import type { StatusTone } from '@/types/status'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { StatusMark } from '@/components/status-mark'
import { STAGES, type StageId, type ViewKey, share } from './model'
import type { GateStats } from './queries'

export type StageState = 'on' | 'off' | 'unset' | 'loading'

const TONES: Record<StageState, StatusTone> = {
  on: { key: 'on', text: '开', cls: 'ok' },
  off: { key: 'off', text: '关', cls: 'off' },
  unset: { key: 'unset', text: '未配置', cls: 'caution' },
  loading: { key: 'loading', text: '读取中', cls: 'none' },
}

function Cell({
  view,
  current,
  onView,
  step,
  name,
  state,
  value,
  foot,
  alert,
}: {
  view: ViewKey
  current: ViewKey
  onView: (view: ViewKey) => void
  step?: number
  name: string
  state?: StageState
  value: number | null
  foot: React.ReactNode
  alert?: React.ReactNode
}) {
  const selected = view === current
  return (
    <button
      type='button'
      role='tab'
      id={`risk-tab-${view}`}
      aria-selected={selected}
      aria-controls='risk-panel'
      tabIndex={selected ? 0 : -1}
      onClick={() => onView(view)}
      className={cn(
        'group relative flex min-h-28 cursor-pointer flex-col gap-2 bg-card px-4 pt-3 pb-3.5 text-left transition-colors duration-200 outline-none hover:bg-muted/50 focus-visible:z-20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset motion-reduce:transition-none',
        selected && 'bg-muted/60 shadow-[inset_0_-2px_0_var(--primary)]'
      )}
    >
      {step ? (
        <span
          aria-hidden='true'
          className='absolute top-1/2 left-0 z-10 hidden size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border bg-background text-muted-foreground lg:flex'
        >
          <ChevronRight className='size-3' />
        </span>
      ) : null}
      <span className='flex items-center justify-between gap-2'>
        <span className='flex min-w-0 items-center gap-1.5 text-sm font-medium'>
          {step ? (
            <span className='font-mono text-xs text-muted-foreground tabular-nums'>
              {step}
            </span>
          ) : null}
          <span className='truncate'>{name}</span>
        </span>
        {state ? <StatusMark tone={TONES[state]} /> : null}
      </span>
      <span className='text-2xl leading-none font-semibold tracking-tight tabular-nums'>
        {value == null ? '—' : value.toLocaleString()}
      </span>
      <span className='mt-auto text-xs text-muted-foreground tabular-nums'>
        {foot}
      </span>
      {alert}
    </button>
  )
}

/**
 * The gate itself: inbound on the left, each stage in the order the request
 * meets it, released traffic on the right. Each cell selects its audit view.
 */
export function GateRail({
  stats,
  states,
  view,
  onView,
}: {
  stats: GateStats | undefined
  states: Record<StageId, StageState>
  view: ViewKey
  onView: (view: ViewKey) => void
}) {
  const blocks = stats?.blocks || []
  const passes = stats?.passes || []
  const blocked = stats?.blocked ?? null
  const passed = stats?.passed ?? null
  const total = stats?.total ?? null
  const failOpen = passes
    .filter((row) => row.by === 'fail-open')
    .reduce((sum, row) => sum + row.count, 0)
  const order: ViewKey[] = ['all', ...STAGES.map((s) => s.id), 'pass']

  return (
    <div
      role='tablist'
      aria-label='关卡'
      className='grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3 lg:grid-cols-6'
      onKeyDown={(event) => {
        const step =
          event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
        if (!step) return
        event.preventDefault()
        const next =
          order[(order.indexOf(view) + step + order.length) % order.length]
        onView(next)
        document.getElementById(`risk-tab-${next}`)?.focus()
      }}
    >
      <Cell
        view='all'
        current={view}
        onView={onView}
        name='今日入站'
        value={total}
        foot={
          total == null
            ? '读取中'
            : `拦下 ${(blocked ?? 0).toLocaleString()} · ${share(blocked ?? 0, total)}`
        }
      />
      {STAGES.map((stage, index) => {
        const count = blocks
          .filter((row) => row.by === stage.id)
          .reduce((sum, row) => sum + row.count, 0)
        return (
          <Cell
            key={stage.id}
            view={stage.id}
            current={view}
            onView={onView}
            step={index + 1}
            name={stage.name}
            state={states[stage.id]}
            value={stats ? count : null}
            foot={
              stats ? `拦下 · 占入站 ${share(count, total ?? 0)}` : '读取中'
            }
          />
        )
      })}
      <Cell
        view='pass'
        current={view}
        onView={onView}
        step={STAGES.length + 1}
        name='放行出站'
        value={passed}
        foot={total == null ? '读取中' : `放行率 ${share(passed ?? 0, total)}`}
        alert={
          failOpen ? (
            <span className='w-fit rounded-md bg-[var(--status-caution-bg)] px-1.5 py-0.5 text-xs text-[var(--status-caution)] tabular-nums'>
              {failOpen.toLocaleString()} 条故障放行
            </span>
          ) : null
        }
      />
    </div>
  )
}
