import { useEffect, useRef, useState } from 'react'
import { REPO_URL } from '@/config/repo'
import { ArrowUpRight, Star, X } from 'lucide-react'
import { IconGithub } from '@/assets/brand-icons'
import { Button } from '@/components/ui/button'

const STORAGE_KEY = 'vm2api_star_hint_day'
const VISIBLE_MS = 10_000

function localDay(now = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${m}-${d}`
}

/** 当天首次显示即记账：刷新、切页、关掉都不再弹，次日再来。 */
function claimToday(): boolean {
  const today = localDay()
  try {
    if (localStorage.getItem(STORAGE_KEY) === today) return false
    localStorage.setItem(STORAGE_KEY, today)
    return true
  } catch {
    // 存储不可用时无法去重，宁可不弹也不能每次加载都弹。
    return false
  }
}

export function StarHint() {
  const [open, setOpen] = useState(false)
  const [paused, setPaused] = useState(false)
  const remaining = useRef(VISIBLE_MS)

  useEffect(() => {
    if (claimToday()) setOpen(true)
  }, [])

  // 悬停 / 聚焦时暂停，读完再走；剩余时间和进度条动画同步冻结。
  useEffect(() => {
    if (!open || paused) return
    const startedAt = Date.now()
    const timer = window.setTimeout(() => setOpen(false), remaining.current)
    return () => {
      window.clearTimeout(timer)
      remaining.current -= Date.now() - startedAt
    }
  }, [open, paused])

  if (!open) return null

  return (
    <aside
      role='status'
      aria-label='GitHub Star 提示'
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className='animate-settings-pane-in fixed inset-x-4 bottom-4 z-50 overflow-hidden rounded-xl border border-primary/30 bg-popover text-popover-foreground shadow-lg sm:inset-x-auto sm:right-4 sm:w-[22rem]'
    >
      <div className='pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/12 via-transparent to-transparent' />
      <div className='relative flex gap-3 p-4 pe-10'>
        <span className='grid size-10 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm'>
          <Star aria-hidden className='size-5 fill-current' />
        </span>
        <div className='min-w-0 space-y-2.5'>
          <div className='space-y-0.5'>
            <p className='text-sm font-semibold'>觉得 vm2api 好用？</p>
            <p className='text-[13px] leading-snug text-muted-foreground'>
              去 GitHub 点个 Star，帮更多人发现这个项目。
            </p>
          </div>
          <Button asChild size='sm' className='h-8 cursor-pointer gap-1.5'>
            <a
              href={REPO_URL}
              target='_blank'
              rel='noreferrer'
              onClick={() => setOpen(false)}
            >
              <IconGithub aria-hidden className='size-4' />
              Star on GitHub
              <ArrowUpRight aria-hidden className='size-3.5 opacity-70' />
            </a>
          </Button>
        </div>
        <Button
          variant='ghost'
          size='icon'
          aria-label='关闭提示'
          onClick={() => setOpen(false)}
          className='absolute end-2 top-2 size-7 cursor-pointer text-muted-foreground hover:text-foreground'
        >
          <X className='size-4' />
        </Button>
      </div>
      <div
        aria-hidden
        className='animate-countdown-shrink relative h-0.5 bg-primary/70 motion-reduce:hidden'
        style={{
          animationDuration: `${VISIBLE_MS}ms`,
          animationPlayState: paused ? 'paused' : 'running',
        }}
      />
    </aside>
  )
}
