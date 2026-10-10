import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
import { Textarea } from '@/components/ui/textarea'
import { meQueryOptions } from '@/features/auth/queries'
import { vmQueryOptions } from '@/features/vm/queries'
import { PackageFacts } from '@/features/vm/vm-package-view'

function packageFilename(id: string) {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  return `vm-package-${id || 'slot'}-${stamp}.json`
}

function downloadJson(name: string, text: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: 'application/json' })
  )
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export function VmPackageButton({
  vmId,
  className,
}: {
  vmId: string
  className?: string
}) {
  const me = useQuery(meQueryOptions())
  const [open, setOpen] = useState(false)
  if (me.data?.role !== 'admin') return null
  return (
    <>
      <Button
        size='sm'
        variant='outline'
        className={className}
        onClick={() => setOpen(true)}
      >
        完整虚拟机信息
      </Button>
      <VmPackageDialog vmId={vmId} open={open} onOpenChange={setOpen} />
    </>
  )
}

export function VmPackageDialog({
  vmId,
  open,
  onOpenChange,
}: {
  vmId: string
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [parseError, setParseError] = useState('')
  const pack = useQuery({
    queryKey: ['panel', 'vm-package', vmId] as const,
    queryFn: () =>
      api<Record<string, unknown>>(
        `/api/panel/vms/${encodeURIComponent(vmId)}/package`
      ),
    enabled: open,
    gcTime: 0,
  })

  useEffect(() => {
    if (!pack.data) return
    setText(JSON.stringify(pack.data, null, 2))
  }, [pack.data])

  const save = useMutation({
    mutationFn: (body: unknown) =>
      api(`/api/panel/vms/${encodeURIComponent(vmId)}/package`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      toast.success('已覆写此槽')
      await qc.invalidateQueries({ queryKey: vmQueryOptions(vmId).queryKey })
      qc.removeQueries({ queryKey: ['panel', 'vm-package', vmId] })
      onOpenChange(false)
    },
    onError: (e: Error) => toast.error(e.message || '覆写失败'),
  })

  const submit = () => {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      setParseError('JSON 无效，请检查格式后重试')
      return
    }
    setParseError('')
    save.mutate(parsed)
  }

  const busy = save.isPending

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!busy) {
          if (!v) setText('')
          onOpenChange(v)
        }
      }}
    >
      <DialogContent className='gap-5 sm:max-w-4xl'>
        <DialogHeader>
          <DialogTitle className='text-xl tracking-tight'>
            完整虚拟机信息
          </DialogTitle>
          <DialogDescription className='max-w-[68ch]'>
            {vmId} 的完成体。下载带走这份
            JSON。导入只填入窗口，覆写才替换这一台的特征、出口和凭证，不改 id。
          </DialogDescription>
        </DialogHeader>
        {pack.isLoading ? (
          <p className='py-8 text-center text-sm text-muted-foreground'>
            读取中…
          </p>
        ) : pack.error ? (
          <p className='py-8 text-center text-sm text-destructive'>
            {(pack.error as Error).message || '读取打包数据失败'}
          </p>
        ) : (
          <div className='grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]'>
            <div className='rounded-xl border bg-card p-4'>
              {parseError ? (
                <p className='text-xs text-destructive'>{parseError}</p>
              ) : (
                <PackageFacts text={text} className='sm:grid-cols-1' />
              )}
            </div>
            <div className='min-w-0 space-y-2'>
              <Textarea
                className='h-80 font-mono text-[13px] leading-relaxed'
                spellCheck={false}
                value={text}
                disabled={busy}
                aria-label='虚拟机包 JSON'
                onChange={(e) => {
                  setText(e.target.value)
                  if (parseError) setParseError('')
                }}
              />
              <p className='text-xs text-muted-foreground'>
                含明文凭证和代理密码，只在这个窗口里出现。
              </p>
            </div>
          </div>
        )}
        <DialogFooter className='gap-2 sm:justify-between'>
          <div className='flex flex-wrap gap-2'>
            <input
              ref={fileRef}
              type='file'
              accept='application/json,.json'
              className='hidden'
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (!file) return
                file
                  .text()
                  .then((raw) => {
                    setText(raw)
                    setParseError('')
                  })
                  .catch(() => setParseError('读取文件失败'))
              }}
            />
            <Button
              size='sm'
              variant='ghost'
              disabled={!text || busy}
              onClick={() => downloadJson(packageFilename(vmId), text)}
            >
              下载
            </Button>
            <Button
              size='sm'
              variant='ghost'
              disabled={busy || !!pack.error}
              onClick={() => fileRef.current?.click()}
            >
              导入
            </Button>
            <Button
              size='sm'
              variant='ghost'
              disabled={!text || busy}
              onClick={() => {
                navigator.clipboard
                  .writeText(text)
                  .then(() => toast.success('已复制到剪贴板'))
                  .catch(() => toast.error('复制失败'))
              }}
            >
              复制
            </Button>
          </div>
          <div className='flex gap-2'>
            <Button
              size='sm'
              variant='outline'
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button size='sm' disabled={!text || busy} onClick={submit}>
              {busy ? '覆写中…' : '覆写此槽'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
