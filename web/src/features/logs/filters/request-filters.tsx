import type { UsageLogFilterOptions } from '@/types/panel-usage-logs'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import type { LogsFilterState } from '../search'

const ALL = '__all__'

function OptionSelect({
  label,
  allLabel,
  value,
  values,
  loading,
  onChange,
}: {
  label: string
  allLabel: string
  value: string | undefined
  values: string[]
  loading: boolean
  onChange: (value: string | undefined) => void
}) {
  // 当前值可能来自深链、不在近期选项里：补进列表，免得 Select 显示空白。
  const items = value && !values.includes(value) ? [value, ...values] : values
  return (
    <div className='space-y-2'>
      <Label>{label}</Label>
      <Select
        value={value ?? ALL}
        onValueChange={(next) => onChange(next === ALL ? undefined : next)}
      >
        <SelectTrigger className='w-full'>
          <SelectValue placeholder={loading ? '加载中...' : allLabel} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {loading && !items.length ? (
            <div className='p-2 text-center text-sm text-muted-foreground'>
              加载中...
            </div>
          ) : null}
          {items.map((item) => (
            <SelectItem key={item} value={item}>
              {item}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function RequestFilters({
  filters,
  options,
  optionsLoading,
  onChange,
}: {
  filters: LogsFilterState
  options: UsageLogFilterOptions | undefined
  optionsLoading: boolean
  onChange: (filters: LogsFilterState) => void
}) {
  return (
    <div className='grid gap-4 sm:grid-cols-2'>
      <OptionSelect
        label='模型'
        allLabel='全部模型'
        value={filters.model}
        values={(options?.models ?? []).filter((m) => m.trim())}
        loading={optionsLoading}
        onChange={(model) => onChange({ ...filters, model })}
      />
      <div className='space-y-2'>
        <Label htmlFor='actual-response-model-mismatch-filter'>
          计费/实际模型不一致
        </Label>
        <div className='flex items-center justify-between gap-3 rounded-md border border-input bg-background px-3 py-2'>
          <Label
            htmlFor='actual-response-model-mismatch-filter'
            className='text-sm font-normal'
          >
            仅显示不一致
          </Label>
          <Switch
            id='actual-response-model-mismatch-filter'
            checked={!!filters.mismatch}
            onCheckedChange={(on) =>
              onChange({ ...filters, mismatch: on || undefined })
            }
          />
        </div>
      </div>
      <OptionSelect
        label='端点'
        allLabel='全部端点'
        value={filters.endpoint}
        values={options?.endpoints ?? []}
        loading={optionsLoading}
        onChange={(endpoint) => onChange({ ...filters, endpoint })}
      />
      <OptionSelect
        label='协议'
        allLabel='全部协议'
        value={filters.protocol}
        values={options?.protocols ?? []}
        loading={optionsLoading}
        onChange={(protocol) => onChange({ ...filters, protocol })}
      />
    </div>
  )
}
