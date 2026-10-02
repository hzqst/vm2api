import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ClusterLocalStatus } from '@/types/panel-cluster'
import type { StatusTone } from '@/types/status'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { StatusMark } from '@/components/status-mark'
import { CLUSTER_LOCAL_KEY } from '@/features/cluster/queries'

const TONE = {
  ok: { key: 'ok', cls: 'ok', text: '' },
  caution: { key: 'caution', cls: 'caution', text: '' },
  bad: { key: 'bad', cls: 'bad', text: '' },
} satisfies Record<string, StatusTone>

type Row = { label: string; value: string; tone?: StatusTone; hint?: string }

function controlText(c: ClusterLocalStatus['control']): string {
  if (c.mode === 'process') return '本机进程 · 宿主网络'
  const net = c.network_mode || '未知网络'
  const kind =
    net === 'host' ? 'host 网络' : net === 'bridge' ? 'bridge（NAT）' : net
  return `容器 ${c.container || ''} · ${kind}`
}

function rows(
  s: ClusterLocalStatus,
  outbound: { ready: number; total: number }
): Row[] {
  const { control, nat, docker } = s
  const listen = `${control.listen_host ?? '—'}:${control.listen_port ?? '—'}`
  const inbound: Row =
    nat.inbound === 'loopback'
      ? { label: '入站', value: '仅本机监听', tone: TONE.ok }
      : nat.inbound === 'open'
        ? {
            label: '入站',
            value: `公网可达 ${nat.public_ip}:${control.listen_port}`,
            tone: TONE.caution,
            hint: '面板暴露在公网，建议只监听 127.0.0.1 并走反代或防火墙',
          }
        : nat.inbound === 'closed'
          ? { label: '入站', value: '公网不可达', tone: TONE.ok }
          : { label: '入站', value: '—', hint: nat.note }
  return [
    { label: '控制面', value: controlText(control) },
    { label: '监听', value: listen },
    {
      label: '公网出口',
      value: nat.public_ip || '—',
      hint: nat.observed_via
        ? `由 ${nat.observed_via.label} 观测`
        : nat.note || undefined,
    },
    {
      label: 'NAT',
      value:
        nat.behind_nat == null
          ? '—'
          : nat.behind_nat
            ? '在 NAT 后（仅出站，不影响接入）'
            : '公网地址直连',
    },
    inbound,
    docker.ok
      ? {
          label: '本机 Docker',
          value: `${docker.version} · 运行 ${docker.running ?? '—'} / ${docker.containers ?? '—'} · 槽容器 ${docker.slots ?? '—'}`,
          tone: TONE.ok,
        }
      : {
          label: '本机 Docker',
          value: '不可用',
          tone: TONE.bad,
          hint: docker.error || undefined,
        },
    {
      label: '集群出站',
      value: `${outbound.ready} / ${outbound.total} 节点已连接`,
      tone:
        outbound.total === 0
          ? undefined
          : outbound.ready === outbound.total
            ? TONE.ok
            : TONE.caution,
    },
  ]
}

export function LocalLink({
  status,
  error,
  outbound,
}: {
  status: ClusterLocalStatus | undefined
  error: Error | null
  outbound: { ready: number; total: number }
}) {
  const qc = useQueryClient()
  const refresh = useMutation({
    mutationFn: () =>
      api<ClusterLocalStatus>('/api/panel/cluster/local?refresh=1'),
    onSuccess: (data) => qc.setQueryData(CLUSTER_LOCAL_KEY, data),
    onError: (err) => toast.error(err.message),
  })

  return (
    <div className='border-t px-4 py-3'>
      <div className='mb-2 flex items-center justify-between'>
        <span className='text-[11.5px] text-muted-foreground'>
          链路
          {status
            ? ` · ${new Date(status.checked_at).toLocaleTimeString()}`
            : ''}
        </span>
        <Button
          size='sm'
          variant='ghost'
          className='h-6 px-2 text-xs'
          disabled={refresh.isPending}
          onClick={() => refresh.mutate()}
        >
          {refresh.isPending ? '观测中…' : '重新观测'}
        </Button>
      </div>
      {error ? (
        <p className='text-xs text-red-3'>{error.message}</p>
      ) : !status ? (
        <p className='text-xs text-muted-foreground'>加载中…</p>
      ) : (
        <dl className='grid grid-cols-1 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2'>
          {rows(status, outbound).map((row) => (
            <div key={row.label} className='flex min-w-0 items-start gap-2'>
              <dt className='w-20 shrink-0 text-muted-foreground'>
                {row.label}
              </dt>
              <dd className='min-w-0'>
                {row.tone ? (
                  // StatusMark shows its tone text next to the shape; the value is that text.
                  <StatusMark tone={{ ...row.tone, text: row.value }} />
                ) : (
                  <span className='font-mono break-all'>{row.value}</span>
                )}
                {row.hint ? (
                  <div className='text-[11px] text-muted-foreground'>
                    {row.hint}
                  </div>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}
