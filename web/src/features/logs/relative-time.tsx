import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatShortDistance } from '@/features/logs/log-display'

type Listener = () => void

// 一个 10s 心跳驱动全部相对时间：虚拟列表里上百个单元格各开定时器既浪费又不同步。
const listeners = new Set<Listener>()
let intervalId: number | null = null

function subscribeToTick(listener: Listener): () => void {
  listeners.add(listener)
  intervalId ??= window.setInterval(() => {
    for (const fn of listeners) fn()
  }, 10_000)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && intervalId != null) {
      window.clearInterval(intervalId)
      intervalId = null
    }
  }
}

/** 相对时间（刚刚 / N秒前 …），悬停显示带时区偏移的绝对时间。 */
export function RelativeTime({
  date,
  className,
  fallback = '—',
}: {
  date: string | null
  className?: string
  fallback?: string
}) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => subscribeToTick(() => setNow(new Date())), [])
  if (!date) return <span className={className}>{fallback}</span>
  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime()))
    return <span className={className}>{fallback}</span>
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <time className={className} dateTime={parsed.toISOString()}>
          {formatShortDistance(parsed, now)}
        </time>
      </TooltipTrigger>
      <TooltipContent>
        {format(parsed, "yyyy-MM-dd HH:mm:ss 'GMT'xxx")}
      </TooltipContent>
    </Tooltip>
  )
}
