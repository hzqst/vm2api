import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { VIEW_TITLES } from '@/config/nav'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/page-header'
import { CardGridSkeleton } from '@/components/page-skeletons'
import { QueryGate } from '@/components/query-gate'
import { modelsQueryOptions } from '@/features/models/queries'
import { dashboardQueryOptions } from '@/features/overview/queries'
import { DistillCard } from './distill-card'
import { RefusalGuardCard } from './refusal-guard-card'

export function ProtocolPage() {
  const dash = useQuery(dashboardQueryOptions())
  const models = useQuery(modelsQueryOptions())
  const base = String(dash.data?.health?.base_url || location.origin).replace(
    /\/$/,
    ''
  )
  const items = models.data?.items || []
  const copy = (text: string) => {
    void navigator.clipboard.writeText(text)
    toast.success('已复制')
  }
  return (
    <PageHeader title={VIEW_TITLES.protocol}>
      <QueryGate
        loading={dash.isLoading || models.isLoading}
        error={dash.error || models.error}
        skeleton={
          <CardGridSkeleton cards={2} className='grid gap-4 lg:grid-cols-2' />
        }
      >
        <div className='grid gap-4 lg:grid-cols-2'>
          <Card>
            <CardHeader>
              <CardTitle>端点</CardTitle>
            </CardHeader>
            <CardContent className='space-y-2 text-sm'>
              <div className='flex items-center justify-between gap-2'>
                <code>{base}/v1</code>
                <Button
                  size='sm'
                  variant='outline'
                  onClick={() => copy(`${base}/v1`)}
                >
                  复制
                </Button>
              </div>
              <div className='flex items-center justify-between gap-2'>
                <code>{base}/v1/messages</code>
                <Button
                  size='sm'
                  variant='outline'
                  onClick={() => copy(`${base}/v1/messages`)}
                >
                  复制
                </Button>
              </div>
              <p className='text-muted-foreground'>
                人设在{' '}
                <Link
                  to='/settings/$tab'
                  params={{ tab: 'protocol' }}
                  className='underline underline-offset-4'
                >
                  设置 → 协议
                </Link>
                。wrap / crag 数据面在设置 → 协议或{' '}
                <Link to='/wrap' className='underline underline-offset-4'>
                  内核页
                </Link>
                。蒸馏拦截与拒答缓存在本页保存。
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>模型 id</CardTitle>
            </CardHeader>
            <CardContent className='space-y-1 font-mono text-xs'>
              {items.map((m) => (
                <div key={m.id} className='flex justify-between gap-2'>
                  <span>{m.id}</span>
                  <Button size='sm' variant='ghost' onClick={() => copy(m.id)}>
                    复制
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </QueryGate>
      <div className='mt-4 space-y-4'>
        <DistillCard />
        <RefusalGuardCard />
      </div>
    </PageHeader>
  )
}
