import type { UsageAccountRow } from '@/types/panel-usage'
import type { Vm } from '@/types/panel-vm'
import {
  expiresAtToMs,
  fmtResetClock,
  resetCountdown,
} from '@/lib/fable-status'
import { fmtNum, fmtUsd, usedPctOf } from '@/lib/format'
import { cn } from '@/lib/utils'
import { isCodexVm } from '@/lib/vm-kind'
import { vmWeekOutcome, vmWindowCosts } from '@/lib/vm-usage'
import { useNow } from '@/hooks/use-now'
import { OpenaiQuotaActions } from '@/features/vm/openai-quota-actions'
import { fableRow, riskFg, UsageMeter } from '@/features/vm/usage-meter'

/**
 * 统一用量窗口：列表行、网格卡片、详情卡共用同一套五列网格。
 * 标签 | 条 | 百分比 | 窗口费用 | 重置倒计时。
 * 行序固定 5h → 7d → Fable：Fable 只在 Max 上出现，缺席时不挪动前两行。
 */
const ROW_GRID =
  'grid grid-cols-[1.75rem_minmax(2.5rem,1fr)_2.5rem_3.25rem_4.25rem] items-center gap-x-1.5'

function WindowRow({
  label,
  value,
  cost,
  reset,
  resetTitle,
  title,
  note,
  quiet,
}: {
  label: string
  value?: number
  cost?: number | null
  reset?: string | null
  resetTitle?: string | null
  title?: string
  /** 无百分比的态（拒 / 满）：用文案替换条与百分比。 */
  note?: string
  /** 卡片是分诊面：绿色数字铺满一屏是噪声，颜色只留给越线的档。 */
  quiet?: boolean
}) {
  const pct = value ?? 0
  const risky = pct >= 70
  return (
    <div className={ROW_GRID} title={title}>
      <span className='text-xs font-medium text-muted-foreground'>{label}</span>
      {note ? (
        <span className='col-span-2 truncate text-xs font-medium text-[color:var(--status-warn)]'>
          {note}
        </span>
      ) : (
        <>
          <UsageMeter value={pct} size='sm' ticks={false} />
          <span
            className={cn(
              'text-right font-mono text-xs font-medium tabular-nums',
              (!quiet || risky) && riskFg(pct)
            )}
          >
            {pct.toFixed(0)}%
          </span>
        </>
      )}
      <span className='text-right font-mono text-[11px] text-foreground/70 tabular-nums'>
        {cost != null && cost > 0 ? fmtUsd(cost, 2) : ''}
      </span>
      <span
        className='text-right font-mono text-[11px] text-muted-foreground tabular-nums'
        title={resetTitle || undefined}
      >
        {reset ?? ''}
      </span>
    </div>
  )
}

export function VmUsageWindows({
  vm,
  accounts,
  quiet = false,
  quotaActions = false,
  className,
}: {
  vm: Vm
  accounts?: UsageAccountRow[]
  quiet?: boolean
  /** GPT 槽在窗口下方追加「查询 / 重置券」；Claude 槽没有这套额度，忽略。 */
  quotaActions?: boolean
  className?: string
}) {
  const now = useNow()
  const hasToken = Boolean(vm.has_token)
  const codex = isCodexVm(vm)
  const fable = codex ? null : fableRow(vm)
  const costs = vmWindowCosts(vm, accounts)
  const week = vmWeekOutcome(vm, accounts)
  // 无凭证槽没有窗口，倒计时无意义；有票才算。
  const cd = (v: unknown) => (hasToken ? resetCountdown(v, now) : null)
  const clock = (v: unknown) =>
    hasToken && expiresAtToMs(v) ? `重置于 ${fmtResetClock(v)}` : null
  const fiveReq = Number(vm.window_5h_requests) || 0
  const fiveTok = Number(vm.window_5h_tokens) || 0
  const fiveTitle =
    fiveReq > 0 || fiveTok > 0
      ? `5h 窗口 ${fmtNum(fiveReq)} req / ${fmtNum(fiveTok)} tok`
      : undefined
  const weekTitle =
    week.req > 0 || week.tok > 0
      ? `7d 窗口 ${fmtNum(week.req)} req / ${fmtNum(week.tok)} tok`
      : undefined
  return (
    <div className={cn('space-y-1', className)}>
      <WindowRow
        label='5h'
        value={usedPctOf(vm, '5h')}
        cost={costs.h5}
        reset={cd(vm.reset_5h)}
        resetTitle={clock(vm.reset_5h)}
        title={fiveTitle}
        quiet={quiet}
      />
      <WindowRow
        label='7d'
        value={usedPctOf(vm, '7d')}
        cost={costs.d7}
        reset={cd(vm.reset_7d)}
        resetTitle={clock(vm.reset_7d)}
        title={weekTitle}
        quiet={quiet}
      />
      {fable?.kind === 'bar' ? (
        <WindowRow
          label='Fable'
          value={fable.pct}
          reset={cd(vm.reset_7d_oi)}
          resetTitle={clock(vm.reset_7d_oi)}
          quiet={quiet}
        />
      ) : fable?.kind === 'note' ? (
        <WindowRow label='Fable' note={fable.text} />
      ) : null}
      {quotaActions && codex ? (
        <div className='pt-0.5'>
          <OpenaiQuotaActions vm={vm} compact />
        </div>
      ) : null}
    </div>
  )
}
