import type { ReactNode, Ref } from 'react'
import { cn } from '@/lib/utils'

/** hub bento 网格：手机单列、平板两列、桌面四列。 */
export function BentoGrid({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'grid gap-4 md:gap-6',
        'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
        'auto-rows-[minmax(140px,auto)]',
        className
      )}
    >
      {children}
    </div>
  )
}

/** hub bento 玻璃卡：半透明底 + 模糊 + 顶部内高光。 */
export function BentoCard({
  children,
  className,
  ref,
}: {
  children: ReactNode
  className?: string
  ref?: Ref<HTMLDivElement>
}) {
  return (
    <div
      ref={ref}
      className={cn(
        'relative overflow-hidden rounded-2xl',
        'bg-card/60 dark:bg-[rgba(20,20,23,0.5)]',
        'backdrop-blur-lg',
        'border border-border/50 dark:border-white/[0.08]',
        'shadow-sm',
        'p-4 md:p-5',
        'before:pointer-events-none before:absolute before:inset-0 before:z-[1] before:bg-gradient-to-b before:from-white/[0.02] before:to-transparent',
        'transition-all duration-300 ease-out',
        'group',
        className
      )}
    >
      {/* hub 外层的 flex 类落不到子元素上，这里让内层自己成为列布局，flex-1 才生效。 */}
      <div className='relative z-10 flex h-full flex-col'>{children}</div>
    </div>
  )
}
