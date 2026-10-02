import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { AuthScheme, Vm } from '@/types/panel-vm'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import {
  authSchemeLabel,
  authSchemeOf,
  credTypeOf,
  defaultAuthScheme,
  normalizeAuthScheme,
} from '@/lib/cred-type'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { dashboardQueryOptions } from '@/features/overview/queries'
import { isRemoteVm, REMOTE_UNSUPPORTED_TEXT } from '@/features/vm/placement'
import { vmQueryOptions } from '@/features/vm/queries'

/** 「跟随凭证类型默认」在 select 里的哨兵值 —— 提交时翻译成空串。 */
const FOLLOW = 'follow'

export function AuthSchemeEditor({ vm }: { vm: Vm }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  // null 不是异常，只表示「从未显式设置，跟随默认」
  const explicit = normalizeAuthScheme(vm.auth_scheme)
  const effective = authSchemeOf(vm)
  const fallback = defaultAuthScheme(credTypeOf(vm))
  const [value, setValue] = useState<string>(explicit ?? FOLLOW)

  const save = useMutation({
    mutationFn: () =>
      api<Record<string, unknown>>(
        `/api/panel/vms/${encodeURIComponent(vm.id)}`,
        {
          method: 'PATCH',
          // 重置为默认必须发空串：后端判定是 `!= null`，
          // 发 null 会被当成「没传」进而 400。
          body: JSON.stringify({
            auth_scheme: value === FOLLOW ? '' : value,
          }),
        }
      ),
    onSuccess: () => {
      toast.success(
        value === FOLLOW
          ? `上游认证已重置为默认（${authSchemeLabel(fallback)}）`
          : `上游认证已切到 ${authSchemeLabel(value as AuthScheme)}`
      )
      // 后端写入的是规范化后的值，不能假设「写什么读回什么」——重新拉取为准
      qc.invalidateQueries({ queryKey: vmQueryOptions(vm.id).queryKey })
      qc.invalidateQueries({ queryKey: dashboardQueryOptions().queryKey })
      setOpen(false)
    },
    onError: (e: Error) => toast.error(e.message || '更新失败'),
  })

  return (
    <>
      {isRemoteVm(vm) ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                size='sm'
                variant='ghost'
                className='h-6 px-2 text-xs'
                disabled
              >
                编辑
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>{REMOTE_UNSUPPORTED_TEXT}</TooltipContent>
        </Tooltip>
      ) : (
        <Button
          size='sm'
          variant='ghost'
          className='h-6 px-2 text-xs'
          onClick={() => {
            setValue(explicit ?? FOLLOW)
            setOpen(true)
          }}
        >
          编辑
        </Button>
      )}
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!save.isPending) setOpen(v)
        }}
      >
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>上游认证方式</DialogTitle>
            <DialogDescription>
              决定发往 Anthropic 的凭证放在哪个请求头，两者互斥。
              这是排障/兼容开关，日常无需改动。
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-1.5'>
            <Label htmlFor='vm-auth-scheme'>请求头</Label>
            <Select
              value={value}
              onValueChange={setValue}
              disabled={save.isPending}
            >
              <SelectTrigger id='vm-auth-scheme'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FOLLOW}>
                  默认（跟随凭证类型 · {authSchemeLabel(fallback)}）
                </SelectItem>
                <SelectItem value='x_api_key'>
                  {authSchemeLabel('x_api_key')}
                </SelectItem>
                <SelectItem value='authorization_bearer'>
                  {authSchemeLabel('authorization_bearer')}
                </SelectItem>
              </SelectContent>
            </Select>
            <p className='text-xs text-muted-foreground'>
              当前生效：{authSchemeLabel(effective)}
              {explicit ? '（显式设置）' : '（跟随默认）'}
            </p>
          </div>
          <DialogFooter>
            <Button
              size='sm'
              variant='outline'
              disabled={save.isPending}
              onClick={() => setOpen(false)}
            >
              取消
            </Button>
            <Button
              size='sm'
              disabled={save.isPending}
              loading={save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
