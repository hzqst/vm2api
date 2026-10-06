import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type StepStatus = 'success' | 'failure' | 'warning' | 'pending'

const STYLES: Record<StepStatus, { dot: string; bg: string; text: string }> = {
  success: {
    dot: 'bg-emerald-500',
    bg: 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800',
    text: 'text-emerald-700 dark:text-emerald-300',
  },
  failure: {
    dot: 'bg-rose-500',
    bg: 'bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800',
    text: 'text-rose-700 dark:text-rose-300',
  },
  warning: {
    dot: 'bg-amber-500',
    bg: 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800',
    text: 'text-amber-700 dark:text-amber-300',
  },
  pending: {
    dot: 'bg-slate-400',
    bg: 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700',
    text: 'text-slate-600 dark:text-slate-400',
  },
}

/** 决策链时间线的一步（hub `StepCard`）。 */
export function StepCard({
  step,
  icon: Icon,
  title,
  subtitle,
  status,
  offsetMs,
  details,
  isLast,
  defaultExpanded = false,
}: {
  step: number
  icon: LucideIcon
  title: string
  subtitle?: string | null
  status: StepStatus
  /** 相对首次尝试开始的毫秒偏移，显示为 `+Nms`。 */
  offsetMs?: number | null
  details?: ReactNode
  isLast?: boolean
  defaultExpanded?: boolean
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const style = STYLES[status]
  const toggle = () => details && setExpanded((open) => !open)
  return (
    <div className='flex gap-3'>
      <div className='flex flex-col items-center'>
        <div
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2',
            style.bg
          )}
        >
          <span className={cn('text-xs font-semibold', style.text)}>
            {step}
          </span>
        </div>
        {!isLast ? (
          <div className={cn('min-h-[20px] w-0.5 flex-1', style.dot)} />
        ) : null}
      </div>
      <div className={cn('min-w-0 flex-1', !isLast && 'pb-4')}>
        <div
          role={details ? 'button' : undefined}
          tabIndex={details ? 0 : undefined}
          onClick={toggle}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              toggle()
            }
          }}
          className={cn(
            'rounded-lg border p-3 transition-colors sm:p-4',
            style.bg,
            details && 'cursor-pointer hover:shadow-sm'
          )}
        >
          <div className='flex items-start gap-2'>
            <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', style.text)} />
            <div className='min-w-0 flex-1'>
              <div className='flex items-center justify-between gap-2'>
                <span className={cn('text-sm font-medium', style.text)}>
                  {title}
                </span>
                <div className='flex items-center gap-1'>
                  {offsetMs != null ? (
                    <span className='font-mono text-xs text-muted-foreground'>
                      +{Math.round(offsetMs)}ms
                    </span>
                  ) : null}
                  {details ? (
                    expanded ? (
                      <ChevronDown className='h-4 w-4 text-muted-foreground' />
                    ) : (
                      <ChevronRight className='h-4 w-4 text-muted-foreground' />
                    )
                  ) : null}
                </div>
              </div>
              {subtitle ? (
                <p className='mt-0.5 line-clamp-2 text-xs text-muted-foreground'>
                  {subtitle}
                </p>
              ) : null}
            </div>
          </div>
          {expanded && details ? (
            <div className='mt-3 border-t border-current/10 pt-3'>
              {details}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
