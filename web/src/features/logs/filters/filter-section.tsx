import { useState, type ReactNode } from 'react'
import { ChevronDown, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'

export function FilterSection({
  title,
  description,
  icon: Icon,
  defaultOpen = false,
  activeCount = 0,
  children,
}: {
  title: string
  description?: string
  icon: LucideIcon
  defaultOpen?: boolean
  activeCount?: number
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className='relative overflow-hidden rounded-xl border border-border/50 bg-card/30 backdrop-blur-sm transition-all duration-200 hover:border-border'>
        <div className='pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent' />
        <div className='relative z-10'>
          <CollapsibleTrigger asChild>
            <button
              type='button'
              className='flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left transition-colors active:bg-muted/30'
            >
              <div className='flex items-center gap-3'>
                <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground'>
                  <Icon className='h-4 w-4' />
                </div>
                <div className='space-y-1'>
                  <h3 className='text-sm leading-none font-semibold text-foreground'>
                    {title}
                  </h3>
                  {description ? (
                    <p className='hidden text-xs leading-relaxed text-muted-foreground sm:block'>
                      {description}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className='flex items-center gap-2'>
                {activeCount > 0 ? (
                  <Badge
                    variant='secondary'
                    className='bg-primary/10 text-primary'
                  >
                    {activeCount}
                  </Badge>
                ) : null}
                <ChevronDown
                  className={cn(
                    'h-4 w-4 text-muted-foreground transition-transform duration-200',
                    open && 'rotate-180'
                  )}
                />
              </div>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className='px-4 pb-4'>
            <div className='pt-1'>{children}</div>
          </CollapsibleContent>
        </div>
      </div>
    </Collapsible>
  )
}
