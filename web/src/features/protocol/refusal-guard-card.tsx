import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { RefusalGuardConfig } from '@/types/panel-routing'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { fmtExpiresAt } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { SettingRow } from '@/components/setting-row'
import { Group } from '@/features/protocol/blocks'
import { refusalGuardsQueryOptions } from '@/features/protocol/queries'

const SIMILARITY_CHOICES = [80, 85, 90, 95] as const

function shortFp(fp: string) {
  const s = String(fp || '')
  if (s.length <= 16) return s
  return `${s.slice(0, 10)}…${s.slice(-6)}`
}

export function RefusalGuardCard() {
  const qc = useQueryClient()
  const q = useQuery(refusalGuardsQueryOptions())
  const [clearOpen, setClearOpen] = useState(false)
  const [clearDevicesOpen, setClearDevicesOpen] = useState(false)
  const [deleteFp, setDeleteFp] = useState<string | null>(null)
  const [unblockId, setUnblockId] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: (patch: Partial<RefusalGuardConfig>) =>
      api<RefusalGuardConfig>('/api/panel/refusal-guards', {
        method: 'PUT',
        body: JSON.stringify(patch),
      }),
    onSuccess: async (data) => {
      toast.success('已保存拒答设置')
      qc.setQueryData(refusalGuardsQueryOptions().queryKey, data)
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const remove = useMutation({
    mutationFn: (fingerprint: string) =>
      api<RefusalGuardConfig>(`/api/panel/refusal-guards/${fingerprint}`, {
        method: 'DELETE',
      }),
    onSuccess: async () => {
      toast.success('已删除指纹')
      setDeleteFp(null)
      await qc.invalidateQueries({
        queryKey: refusalGuardsQueryOptions().queryKey,
      })
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const clear = useMutation({
    mutationFn: () =>
      api<RefusalGuardConfig>('/api/panel/refusal-guards', {
        method: 'DELETE',
        body: JSON.stringify({ confirm: true }),
      }),
    onSuccess: async () => {
      toast.success('已清空拒答缓存')
      setClearOpen(false)
      await qc.invalidateQueries({
        queryKey: refusalGuardsQueryOptions().queryKey,
      })
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const unblock = useMutation({
    mutationFn: (deviceId: string) =>
      api<RefusalGuardConfig>('/api/panel/refusal-device-blocks', {
        method: 'DELETE',
        body: JSON.stringify({ device_id: deviceId }),
      }),
    onSuccess: async () => {
      toast.success('已解除 device 封禁')
      setUnblockId(null)
      await qc.invalidateQueries({
        queryKey: refusalGuardsQueryOptions().queryKey,
      })
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const clearDevices = useMutation({
    mutationFn: () =>
      api<RefusalGuardConfig>('/api/panel/refusal-device-blocks', {
        method: 'DELETE',
        body: JSON.stringify({ confirm: true }),
      }),
    onSuccess: async () => {
      toast.success('已清空 device 封禁')
      setClearDevicesOpen(false)
      await qc.invalidateQueries({
        queryKey: refusalGuardsQueryOptions().queryKey,
      })
    },
    onError: (error: Error) => toast.error(error.message),
  })

  if (q.error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>拒答缓存</CardTitle>
        </CardHeader>
        <CardContent className='text-sm text-destructive'>
          {(q.error as Error).message}
        </CardContent>
      </Card>
    )
  }
  if (!q.data) return null
  const data = q.data
  const devices = data.devices ?? []
  const deviceCount = data.device_count ?? devices.length
  const similarity = data.similarity ?? 90
  const deleting = data.items.find((item) => item.fingerprint === deleteFp)

  return (
    <Card>
      <CardHeader className='border-b'>
        <CardTitle>拒答缓存</CardTitle>
        <CardDescription>
          精确指纹命中后直接 503。近似只比较用户正文，短于 512 字不做。
        </CardDescription>
        <div className='flex flex-wrap items-center gap-2'>
          <Badge variant={data.enabled ? 'secondary' : 'outline'}>
            {data.enabled ? '开' : '关'}
          </Badge>
          <Badge variant='outline'>{data.count} 条指纹</Badge>
          <Badge variant='outline'>{deviceCount} 个 device</Badge>
          <Button
            size='sm'
            variant='outline'
            className='ms-auto cursor-pointer'
            disabled={!data.count || clear.isPending}
            onClick={() => setClearOpen(true)}
          >
            清空指纹
          </Button>
        </div>
      </CardHeader>
      <CardContent className='space-y-6'>
        <Group title='策略'>
          <div className='grid gap-3 lg:grid-cols-2'>
            <div className='rounded-lg border px-3'>
              <SettingRow
                label='拦截重复拒答'
                desc='REFUSAL_GUARD=0 会关掉整条守卫'
              >
                <Switch
                  checked={data.enabled}
                  disabled={save.isPending}
                  onCheckedChange={(v) => save.mutate({ enabled: v })}
                />
              </SettingRow>
            </div>
            <div className='rounded-lg border px-3'>
              <SettingRow label='近似拦截' desc='不含共享 system'>
                <Switch
                  checked={data.similarity_enabled !== false}
                  disabled={save.isPending || !data.enabled}
                  onCheckedChange={(v) =>
                    save.mutate({ similarity_enabled: v })
                  }
                />
              </SettingRow>
            </div>
            <div className='rounded-lg border px-3 lg:col-span-2'>
              <SettingRow
                label='封禁 device'
                desc='命中后这个 device 的任意 prompt 都不再 hop'
              >
                <Switch
                  checked={data.device_block_enabled !== false}
                  disabled={save.isPending || !data.enabled}
                  onCheckedChange={(v) =>
                    save.mutate({ device_block_enabled: v })
                  }
                />
              </SettingRow>
            </div>
          </div>
          <div className='flex flex-wrap items-center gap-2'>
            <span className='text-sm'>相似度</span>
            {SIMILARITY_CHOICES.map((choice) => (
              <Button
                key={choice}
                size='sm'
                className='cursor-pointer'
                variant={similarity === choice ? 'default' : 'outline'}
                disabled={
                  save.isPending ||
                  !data.enabled ||
                  data.similarity_enabled === false
                }
                onClick={() => save.mutate({ similarity: choice })}
              >
                {choice}%
              </Button>
            ))}
          </div>
        </Group>
        <div className='grid gap-4 lg:grid-cols-2'>
          <Group title='已封禁 device'>
            <div className='flex items-center justify-between gap-2'>
              <p className='text-xs text-muted-foreground'>
                {deviceCount
                  ? devices.length < deviceCount
                    ? `显示最近 ${devices.length} / ${deviceCount}`
                    : `${deviceCount} 个`
                  : '还没有'}
              </p>
              <Button
                size='sm'
                variant='outline'
                className='cursor-pointer'
                disabled={!deviceCount || clearDevices.isPending}
                onClick={() => setClearDevicesOpen(true)}
              >
                全部解除
              </Button>
            </div>
            {devices.length ? (
              <ul className='max-h-80 space-y-2 overflow-y-auto'>
                {devices.map((item) => (
                  <li
                    key={item.device_id}
                    className='flex items-start justify-between gap-2 rounded-lg border p-2'
                  >
                    <div className='min-w-0 flex-1 space-y-0.5'>
                      <p className='truncate font-mono text-sm'>
                        {item.device_id}
                      </p>
                      <p className='text-xs text-muted-foreground'>
                        {item.reason || 'refusal_guard'} · 命中 {item.hit_count}{' '}
                        · {fmtExpiresAt(item.last_seen_at)}
                      </p>
                    </div>
                    <Button
                      size='sm'
                      variant='ghost'
                      className='cursor-pointer'
                      onClick={() => setUnblockId(item.device_id)}
                    >
                      解除
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </Group>
          <Group title='指纹'>
            <p className='text-xs text-muted-foreground'>
              {data.count
                ? data.items.length < data.count
                  ? `显示最近 ${data.items.length} / ${data.count}`
                  : `${data.count} 条`
                : '还没有上游拒答'}
            </p>
            {data.items.length ? (
              <ul className='max-h-80 space-y-2 overflow-y-auto'>
                {data.items.map((item) => (
                  <li
                    key={item.fingerprint}
                    className='flex items-start justify-between gap-2 rounded-lg border p-2'
                  >
                    <div className='min-w-0 flex-1 space-y-0.5'>
                      <p className='truncate text-sm'>
                        {item.preview || '（无预览）'}
                      </p>
                      <p className='font-mono text-xs text-muted-foreground'>
                        {item.model || '—'} · {shortFp(item.fingerprint)} · 命中{' '}
                        {item.hit_count} · {fmtExpiresAt(item.last_seen_at)}
                      </p>
                    </div>
                    <Button
                      size='sm'
                      variant='ghost'
                      className='cursor-pointer'
                      onClick={() => setDeleteFp(item.fingerprint)}
                    >
                      删除
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </Group>
        </div>
      </CardContent>
      <ConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title='清空拒答缓存'
        desc='清空后同样请求会再次 hop 上游。已封禁的 device 不会一起解除。'
        confirmText='清空'
        cancelBtnText='取消'
        destructive
        isLoading={clear.isPending}
        handleConfirm={() => clear.mutate()}
      />
      <ConfirmDialog
        open={clearDevicesOpen}
        onOpenChange={setClearDevicesOpen}
        title='解除全部 device 封禁'
        desc='解除后这些 device 可以再次请求。拒答指纹还在，相同或足够近似的正文仍会被拦。'
        confirmText='全部解除'
        cancelBtnText='取消'
        destructive
        isLoading={clearDevices.isPending}
        handleConfirm={() => clearDevices.mutate()}
      />
      <ConfirmDialog
        open={!!deleteFp}
        onOpenChange={(open) => {
          if (!open) setDeleteFp(null)
        }}
        title='删除这条指纹'
        desc={`删除后「${deleting?.preview || shortFp(deleteFp || '')}」会再次打上游。`}
        confirmText='删除'
        cancelBtnText='取消'
        destructive
        isLoading={remove.isPending}
        handleConfirm={() => {
          if (deleteFp) remove.mutate(deleteFp)
        }}
      />
      <ConfirmDialog
        open={!!unblockId}
        onOpenChange={(open) => {
          if (!open) setUnblockId(null)
        }}
        title='解除这个 device'
        desc={`解除后 ${unblockId || ''} 的新请求不再因为 device 封禁被拦。`}
        confirmText='解除'
        cancelBtnText='取消'
        destructive
        isLoading={unblock.isPending}
        handleConfirm={() => {
          if (unblockId) unblock.mutate(unblockId)
        }}
      />
    </Card>
  )
}
