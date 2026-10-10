import type { ReactNode } from 'react'
import { Main } from '@/components/layout/main'

type PageHeaderProps = {
  title: string
  description?: string
  children?: ReactNode
  extra?: ReactNode
  fluid?: boolean
}

export function PageHeader({
  title,
  description,
  children,
  extra,
  fluid,
}: PageHeaderProps) {
  return (
    <Main fluid={fluid}>
      <div className='mb-4 flex flex-wrap items-end justify-between gap-2'>
        <div className='max-w-full min-w-0'>
          <h2
            className='truncate text-2xl font-bold tracking-tight'
            title={title}
          >
            {title}
          </h2>
          {description ? (
            <p className='mt-1 text-sm text-muted-foreground'>{description}</p>
          ) : null}
        </div>
        {extra}
      </div>
      {children}
    </Main>
  )
}
