import type { Vm } from '@/types/panel-vm'
import {
  BarChart3,
  Link2,
  MoreHorizontal,
  Play,
  RefreshCw,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import { canRefreshCredential, credTypeOf } from '@/lib/cred-type'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { restrictionTitle } from '@/features/vm/clear-restriction'
import { useVmActions } from '@/features/vm/vm-actions-context'

/** 无法刷新时给出原因，与详情页 refreshBlocked 文案一致。 */
export function refreshBlockedReason(vm: Vm): string {
  if (canRefreshCredential(vm)) return ''
  return credTypeOf(vm) === 'apikey'
    ? 'Console API Key 不能刷新'
    : '没有 refresh 令牌，无法刷新'
}

/**
 * 行尾扩展菜单：测试链接 / 查看统计 / 重新授权 / 刷新令牌 / 恢复状态，
 * 破坏性操作（重置、删除）收在分隔线之后。
 */
export function VmActionMenu({
  vm,
  className,
}: {
  vm: Vm
  className?: string
}) {
  const actions = useVmActions()
  const blocked = refreshBlockedReason(vm)
  const restricted = restrictionTitle(vm)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size='icon'
          variant='ghost'
          className={cn('size-7 text-muted-foreground', className)}
          aria-label={`更多操作 ${vm.id}`}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className='size-4' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align='end'
        className='w-44'
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenuItem onSelect={() => actions.openTest(vm)}>
          <Play className='text-[color:var(--status-ok)]' />
          测试链接
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.openStats(vm)}>
          <BarChart3 className='text-[color:var(--tier-pro-solid)]' />
          查看统计
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.openReauth(vm)}>
          <Link2 />
          重新授权
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={Boolean(blocked) || actions.refreshingId === vm.id}
          title={blocked || undefined}
          onSelect={() => actions.refreshToken(vm)}
        >
          <RefreshCw />
          刷新令牌
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={!restricted || actions.recoveringId === vm.id}
          title={restricted ?? '当前没有冷却或熔断'}
          onSelect={() => actions.recover(vm)}
        >
          <RotateCcw />
          恢复状态
        </DropdownMenuItem>
        {actions.reset || actions.remove ? <DropdownMenuSeparator /> : null}
        {actions.reset ? (
          <DropdownMenuItem onSelect={() => actions.reset?.(vm)}>
            <RotateCcw />
            重置槽位
          </DropdownMenuItem>
        ) : null}
        {actions.remove ? (
          <DropdownMenuItem
            variant='destructive'
            onSelect={() => actions.remove?.(vm)}
          >
            <Trash2 />
            删除
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
