import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import type {
  ClusterApiNode,
  ClusterNodeInput,
  ClusterProbeResult,
} from '@/types/panel-cluster'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { jsonBody } from '@/features/cluster/queries'

const NO_JUMP = '__direct__'

type Form = {
  label: string
  host: string
  port: string
  username: string
  authType: 'key' | 'password'
  privateKey: string
  passphrase: string
  password: string
  jumpNodeId: string
}

const EMPTY: Form = {
  label: '',
  host: '',
  port: '22',
  username: 'root',
  authType: 'key',
  privateKey: '',
  passphrase: '',
  password: '',
  jumpNodeId: NO_JUMP,
}

function toInput(form: Form): ClusterNodeInput {
  return {
    label: form.label.trim() || undefined,
    host: form.host.trim(),
    port: Number(form.port) || 22,
    username: form.username.trim(),
    auth_type: form.authType,
    ...(form.authType === 'key'
      ? {
          private_key: form.privateKey,
          passphrase: form.passphrase || undefined,
        }
      : { password: form.password }),
    jump_node_id: form.jumpNodeId === NO_JUMP ? null : form.jumpNodeId,
  }
}

/**
 * 两步接入：先探测拿主机指纹（顺带验证认证和 Docker），确认后再固定指纹写入。
 * 表单里的凭证只在这两次请求里出现，服务端不回传。
 */
export function JoinVpsDialog({
  open,
  onOpenChange,
  nodes,
  onJoined,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  nodes: ClusterApiNode[]
  onJoined: (node: ClusterApiNode) => void
}) {
  const [form, setForm] = useState<Form>(EMPTY)
  const [probe, setProbe] = useState<ClusterProbeResult | null>(null)

  useEffect(() => {
    if (!open) {
      setForm(EMPTY)
      setProbe(null)
    }
  }, [open])

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((cur) => ({ ...cur, [key]: value }))
    // Any edit invalidates the fingerprint the operator is about to confirm.
    setProbe(null)
  }

  const probeMut = useMutation({
    mutationFn: () =>
      api<ClusterProbeResult>(
        '/api/panel/cluster/nodes/probe',
        jsonBody(toInput(form))
      ),
    onSuccess: (data) => {
      if (data.existing_id) {
        toast.error('这台主机和用户已经接入')
        return
      }
      setProbe(data)
    },
    onError: (err) => toast.error(err.message),
  })

  const addMut = useMutation({
    mutationFn: () =>
      api<ClusterApiNode>(
        '/api/panel/cluster/nodes',
        jsonBody({
          ...toInput(form),
          host_key_sha256: probe?.host_key.sha256,
          host_key_alg: probe?.host_key.alg,
        })
      ),
    onSuccess: (node) => {
      toast.success(`已接入 ${node.label}`)
      onJoined(node)
      onOpenChange(false)
    },
    onError: (err) => toast.error(err.message),
  })

  const secretReady =
    form.authType === 'key'
      ? form.privateKey.trim().length > 0
      : form.password.length > 0
  const canProbe =
    form.host.trim().length > 0 &&
    form.username.trim().length > 0 &&
    secretReady &&
    !probeMut.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>接入 VPS</DialogTitle>
          <DialogDescription>
            控制面从本机主动拨 SSH，本机在 NAT 后也能接入。远端在 NAT
            后时，经由一台已接入的节点跳转。
          </DialogDescription>
        </DialogHeader>

        <div className='grid grid-cols-6 gap-3'>
          <div className='col-span-4 space-y-1.5'>
            <Label htmlFor='cluster-host'>主机</Label>
            <Input
              id='cluster-host'
              autoFocus
              autoComplete='off'
              spellCheck={false}
              placeholder='203.0.113.12 或 vps.example.net'
              value={form.host}
              onChange={(e) => set('host', e.target.value)}
            />
          </div>
          <div className='col-span-2 space-y-1.5'>
            <Label htmlFor='cluster-port'>端口</Label>
            <Input
              id='cluster-port'
              inputMode='numeric'
              value={form.port}
              onChange={(e) => set('port', e.target.value)}
            />
          </div>
          <div className='col-span-3 space-y-1.5'>
            <Label htmlFor='cluster-user'>用户</Label>
            <Input
              id='cluster-user'
              autoComplete='off'
              spellCheck={false}
              value={form.username}
              onChange={(e) => set('username', e.target.value)}
            />
          </div>
          <div className='col-span-3 space-y-1.5'>
            <Label htmlFor='cluster-label'>备注</Label>
            <Input
              id='cluster-label'
              autoComplete='off'
              placeholder='可选，如 aws-east'
              value={form.label}
              onChange={(e) => set('label', e.target.value)}
            />
          </div>

          <div className='col-span-6 space-y-1.5'>
            <Tabs
              value={form.authType}
              onValueChange={(v) => set('authType', v as Form['authType'])}
            >
              <TabsList>
                <TabsTrigger value='key'>私钥</TabsTrigger>
                <TabsTrigger value='password'>密码</TabsTrigger>
              </TabsList>
            </Tabs>
            {form.authType === 'key' ? (
              <div className='space-y-2'>
                <Textarea
                  aria-label='私钥'
                  spellCheck={false}
                  className='h-28 font-mono text-[11px]'
                  placeholder='-----BEGIN OPENSSH PRIVATE KEY-----'
                  value={form.privateKey}
                  onChange={(e) => set('privateKey', e.target.value)}
                />
                <Input
                  type='password'
                  autoComplete='off'
                  placeholder='私钥口令（可选）'
                  value={form.passphrase}
                  onChange={(e) => set('passphrase', e.target.value)}
                />
              </div>
            ) : (
              <Input
                type='password'
                aria-label='密码'
                autoComplete='off'
                value={form.password}
                onChange={(e) => set('password', e.target.value)}
              />
            )}
          </div>

          <div className='col-span-6 space-y-1.5'>
            <Label>经由节点</Label>
            <Select
              value={form.jumpNodeId}
              onValueChange={(v) => set('jumpNodeId', v)}
            >
              <SelectTrigger className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_JUMP}>直连</SelectItem>
                {nodes.map((n) => (
                  <SelectItem
                    key={n.id}
                    value={n.id}
                    disabled={n.link.state !== 'ready'}
                  >
                    {n.label} · {n.host}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {probe ? (
          <div className='space-y-1 rounded-md border bg-muted/30 p-3 text-xs'>
            <div className='font-medium text-foreground'>
              核对主机指纹后再接入
            </div>
            <div className='font-mono break-all'>
              {probe.host_key.alg} {probe.host_key.sha256}
            </div>
            {probe.uname ? (
              <div className='text-muted-foreground'>{probe.uname}</div>
            ) : null}
            <div className='text-muted-foreground'>
              Docker：
              {probe.docker.ok
                ? '可用'
                : `不可用（${probe.docker.error}），接入后可在面板安装`}
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            取消
          </Button>
          {probe ? (
            <Button onClick={() => addMut.mutate()} disabled={addMut.isPending}>
              {addMut.isPending ? '接入中…' : '确认指纹并接入'}
            </Button>
          ) : (
            <Button onClick={() => probeMut.mutate()} disabled={!canProbe}>
              {probeMut.isPending ? '探测中…' : '探测'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
