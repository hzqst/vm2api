import { useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

/** hub 用户/供应商下拉的 Popover + Command 组合，按名称在客户端过滤。 */
export function FilterCombobox({
  value,
  options,
  allLabel,
  searchPlaceholder,
  emptyLabel,
  loading,
  onChange,
}: {
  value: string | undefined
  options: { id: string; name: string }[]
  allLabel: string
  searchPlaceholder: string
  emptyLabel: string
  loading?: boolean
  onChange: (value: string | undefined) => void
}) {
  const [open, setOpen] = useState(false)
  const selected = options.find((option) => option.id === value)
  const label = loading
    ? '加载中...'
    : selected
      ? selected.name
      : value || allLabel

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type='button'
          variant='outline'
          role='combobox'
          aria-expanded={open}
          disabled={loading}
          className='w-full justify-between'
        >
          <span className={cn('truncate', !value && 'text-muted-foreground')}>
            {label}
          </span>
          <ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-[320px] p-0' align='start'>
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList className='max-h-[250px] overflow-y-auto'>
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value={`__all__ ${allLabel}`}
                onSelect={() => {
                  onChange(undefined)
                  setOpen(false)
                }}
                className='cursor-pointer'
              >
                <span className='flex-1'>{allLabel}</span>
                {!value ? <Check className='h-4 w-4 text-primary' /> : null}
              </CommandItem>
              {options.map((option) => (
                <CommandItem
                  key={option.id}
                  value={`${option.name} ${option.id}`}
                  onSelect={() => {
                    onChange(option.id)
                    setOpen(false)
                  }}
                  className='cursor-pointer'
                >
                  <span className='flex-1 truncate'>{option.name}</span>
                  {value === option.id ? (
                    <Check className='h-4 w-4 text-primary' />
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
