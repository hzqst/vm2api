import { Columns3, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { LOGS_TABLE_COLUMNS, type LogsTableColumn } from './column-visibility'

export function ColumnVisibilityDropdown({
  hidden,
  onChange,
}: {
  hidden: readonly LogsTableColumn[]
  onChange: (hidden: LogsTableColumn[]) => void
}) {
  const total = LOGS_TABLE_COLUMNS.length
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='outline' size='sm' className='h-8 gap-1.5'>
          <Columns3 className='h-3.5 w-3.5' />
          <span className='hidden sm:inline'>
            {total - hidden.length}/{total}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-48'>
        <DropdownMenuLabel className='text-xs font-medium'>
          显示/隐藏列
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {LOGS_TABLE_COLUMNS.map((column) => {
          const visible = !hidden.includes(column.id)
          return (
            <DropdownMenuItem
              key={column.id}
              className='flex cursor-pointer items-center gap-2'
              onSelect={(event) => {
                event.preventDefault()
                onChange(
                  visible
                    ? [...hidden, column.id]
                    : hidden.filter((id) => id !== column.id)
                )
              }}
            >
              <Checkbox
                checked={visible}
                className='pointer-events-none'
                aria-hidden='true'
              />
              <span className='text-sm'>{column.label}</span>
            </DropdownMenuItem>
          )
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className='flex cursor-pointer items-center gap-2 text-muted-foreground'
          onSelect={(event) => {
            event.preventDefault()
            onChange([])
          }}
        >
          <RotateCcw className='h-3.5 w-3.5' />
          <span className='text-sm'>重置</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
