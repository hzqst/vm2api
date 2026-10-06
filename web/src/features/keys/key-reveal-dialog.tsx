import { useRef } from 'react'
import { toast } from 'sonner'
import { copyText } from '@/lib/clipboard'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export type RevealedKey = {
  title: string
  name?: string
  id?: string
  key: string
}

export function KeyRevealDialog({
  value,
  onClose,
}: {
  value: RevealedKey | null
  onClose: () => void
}) {
  const plain = value?.key || ''
  const fieldRef = useRef<HTMLTextAreaElement>(null)

  function selectKey() {
    fieldRef.current?.focus()
    fieldRef.current?.select()
  }

  async function copy() {
    if (!plain) {
      toast.error('没有可复制的密钥')
      return
    }
    if (await copyText(plain)) {
      toast.success('已复制明文密钥，请妥善保存')
      return
    }
    // Last resort works everywhere: leave the key selected for Ctrl/⌘+C.
    selectKey()
    toast.error(
      '浏览器拒绝写入剪贴板，已选中密钥，请按 Ctrl+C（Mac 为 ⌘+C）复制'
    )
  }

  return (
    <Dialog open={!!value} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {value?.title || '密钥'}
            {value?.name ? ` · ${value.name}` : ''}
          </DialogTitle>
        </DialogHeader>
        <p className='text-xs text-muted-foreground'>
          {value?.id ? (
            <span className='font-mono'>{value.id}</span>
          ) : (
            '明文仅在此弹层展示'
          )}
        </p>
        <textarea
          ref={fieldRef}
          readOnly
          rows={2}
          aria-label='明文密钥'
          spellCheck={false}
          value={plain}
          onFocus={(e) => e.currentTarget.select()}
          className='w-full resize-none rounded-md border bg-muted/40 p-3 font-mono text-sm break-all outline-none focus-visible:ring-2 focus-visible:ring-ring'
        />
        <p className='text-sm text-destructive'>
          关闭后列表仍只显示脱敏片段。可还原的密钥之后还能再点「查看」或「复制」。
        </p>
        <DialogFooter>
          <Button variant='outline' onClick={onClose}>
            关闭
          </Button>
          <Button onClick={() => void copy()}>复制</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
