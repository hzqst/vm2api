import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { VIEW_TITLES } from '@/config/nav'
import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/page-header'
import { CardGridSkeleton } from '@/components/page-skeletons'
import { QueryGate } from '@/components/query-gate'
import { modelsQueryOptions } from '@/features/models/queries'
import { dashboardQueryOptions } from '@/features/overview/queries'
import { DistillCard } from './distill-card'
import { JevInterceptCard } from './jev-card'
import { QuestionBankCard } from './question-bank-card'
import { RefusalGuardCard } from './refusal-guard-card'

function copy(text: string) {
  void navigator.clipboard.writeText(text)
  toast.success('已复制')
}

export function ProtocolPage() {
  const dash = useQuery(dashboardQueryOptions())
  const models = useQuery(modelsQueryOptions())
  const base = String(dash.data?.health?.base_url || location.origin).replace(
    /\/$/,
    ''
  )
  const items = models.data?.items || []
  const endpoints = [`${base}/v1`, `${base}/v1/messages`]

  return (
    <PageHeader title={VIEW_TITLES.protocol}>
      <p className='mb-4 max-w-2xl text-sm text-muted-foreground'>
        入站按蒸馏、硬正则、拒答缓存、决策模型这个顺序处理。一次只改一块。
      </p>
      <Tabs defaultValue='intercept'>
        <TabsList>
          <TabsTrigger value='entry' className='cursor-pointer px-4'>
            入口
          </TabsTrigger>
          <TabsTrigger value='distill' className='cursor-pointer px-4'>
            蒸馏
          </TabsTrigger>
          <TabsTrigger value='intercept' className='cursor-pointer px-4'>
            拦截
          </TabsTrigger>
          <TabsTrigger value='bank' className='cursor-pointer px-4'>
            题库
          </TabsTrigger>
          <TabsTrigger value='refusal' className='cursor-pointer px-4'>
            拒答
          </TabsTrigger>
        </TabsList>

        <TabsContent value='entry' className='mt-4'>
          <QueryGate
            loading={dash.isLoading || models.isLoading}
            error={dash.error || models.error}
            skeleton={
              <CardGridSkeleton
                cards={2}
                className='grid gap-4 lg:grid-cols-2'
              />
            }
          >
            <div className='grid gap-4 lg:grid-cols-2'>
              <Card>
                <CardHeader>
                  <CardTitle>端点</CardTitle>
                </CardHeader>
                <CardContent className='space-y-2'>
                  {endpoints.map((url) => (
                    <div
                      key={url}
                      className='flex items-center justify-between gap-3 rounded-lg border px-3 py-2'
                    >
                      <code className='min-w-0 truncate text-sm'>{url}</code>
                      <Button
                        size='sm'
                        variant='outline'
                        className='cursor-pointer'
                        onClick={() => copy(url)}
                      >
                        <Copy className='size-3.5' aria-hidden='true' />
                        复制
                      </Button>
                    </div>
                  ))}
                  <p className='text-xs text-muted-foreground'>
                    system 提示词在{' '}
                    <Link to='/system' className='underline underline-offset-4'>
                      system提示词
                    </Link>
                    。数据面在{' '}
                    <Link to='/wrap' className='underline underline-offset-4'>
                      内核页
                    </Link>
                    。
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>模型 id</CardTitle>
                </CardHeader>
                <CardContent>
                  {items.length ? (
                    <div className='flex flex-wrap gap-1.5'>
                      {items.map((m) => (
                        <button
                          key={m.id}
                          type='button'
                          className={cn(
                            'cursor-pointer rounded-md bg-muted px-2 py-1 font-mono text-xs text-muted-foreground transition-colors duration-200 hover:text-foreground'
                          )}
                          onClick={() => copy(m.id)}
                        >
                          {m.id}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className='text-sm text-muted-foreground'>
                      还没有模型。
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </QueryGate>
        </TabsContent>

        <TabsContent value='distill' className='mt-4'>
          <DistillCard />
        </TabsContent>
        <TabsContent value='intercept' className='mt-4'>
          <JevInterceptCard />
        </TabsContent>
        <TabsContent value='bank' className='mt-4'>
          <QuestionBankCard />
        </TabsContent>
        <TabsContent value='refusal' className='mt-4'>
          <RefusalGuardCard />
        </TabsContent>
      </Tabs>
    </PageHeader>
  )
}
