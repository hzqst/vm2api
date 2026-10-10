import type { ReactNode } from 'react'
import { BadgeDollarSign, Gauge, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ModelVendorIcon } from '@/components/model-vendor-icon'
import {
  type ModelEntry,
  type ModelParams,
  type ModelPolicy,
  type Pass1mMode,
  contextWindowLabel,
  passContext1mEffective,
  passContext1mMode,
  thinkingPolicyLabel,
} from './policy'

type Props = {
  model: ModelEntry
  live: boolean
  pol: ModelPolicy
  open: boolean
  showBeta?: boolean
  onToggleOpen: () => void
  onToggleEnabled: (on: boolean) => void
  onModel: (fn: (rec: Omit<ModelEntry, 'id'>) => void) => void
  onParam: (key: keyof ModelParams, value: string | number) => void
  onPass1m: (mode: Pass1mMode) => void
}

export function ModelRow({
  model,
  live,
  pol,
  open,
  showBeta = true,
  onToggleOpen,
  onToggleEnabled,
  onModel,
  onParam,
  onPass1m,
}: Props) {
  const on = model.enabled !== false
  const win = contextWindowLabel(model)
  const caps = model.capabilities || {}
  const params = model.params || {}
  const defs = pol.defaults || {}
  const mode = passContext1mMode(model)
  const effective = passContext1mEffective(model, pol)
  const inheritHit = mode === 'inherit' && effective
  const drop = (model.betas?.drop || []).join(', ') || '—'
  const onEnabled =
    params.on_enabled === 'convert_to_adaptive'
      ? 'passthrough'
      : params.on_enabled || 'passthrough'
  const fallback =
    params.thinking_fallback_budget != null
      ? params.thinking_fallback_budget
      : defs.thinking_fallback_budget || 4096
  const displayName = model.display_name || model.id
  const billing = billingInfo(model)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next !== open) onToggleOpen()
      }}
    >
      <div
        className={cn(
          'group rounded-xl border border-border/70 bg-card p-3 text-sm shadow-sm transition-[border-color,box-shadow,transform,background-color] duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:bg-muted/15 hover:shadow-md',
          !on && 'opacity-65'
        )}
      >
        <div
          role='button'
          tabIndex={0}
          className='grid gap-3 outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:grid-cols-[minmax(0,1fr)_auto]'
          onClick={onToggleOpen}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            onToggleOpen()
          }}
        >
          <div className='min-w-0 space-y-3'>
            <div className='flex items-start gap-3'>
              <div className='mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-muted/70 ring-1 ring-border/60'>
                <ModelVendorIcon modelId={model.id} className='size-5' />
              </div>
              <div className='min-w-0 flex-1'>
                <div className='flex flex-wrap items-center gap-2'>
                  <h3 className='truncate text-base font-semibold tracking-tight'>
                    {displayName}
                  </h3>
                  <Badge variant={live ? 'default' : 'secondary'}>
                    {live ? '对外' : '隐藏'}
                  </Badge>
                  {on ? null : <Badge variant='outline'>停用</Badge>}
                </div>
                <p className='mt-1 truncate font-mono text-[11px] text-muted-foreground'>
                  {model.id}
                </p>
              </div>
            </div>

            <div className='grid gap-2 text-xs sm:grid-cols-3'>
              <Metric label='上下文' value={win.text} strong />
              <Metric
                label='输出上限'
                value={`${formatK(params.max_tokens_cap ?? 64000)}`}
              />
              <Metric label='Thinking' value={thinkingPolicyLabel(model)} />
            </div>

            <div className='flex flex-wrap gap-1.5'>
              {(model.aliases || []).slice(0, 4).map((alias) => (
                <Badge key={alias} variant='outline' className='font-mono'>
                  {alias}
                </Badge>
              ))}
              {(model.aliases || []).length > 4 ? (
                <Badge variant='secondary'>
                  +{(model.aliases || []).length - 4}
                </Badge>
              ) : null}
              {!(model.aliases || []).length ? (
                <span className='text-xs text-muted-foreground'>
                  未设置别名
                </span>
              ) : null}
            </div>
          </div>

          <div className='flex items-center justify-between gap-3 sm:w-32 sm:flex-col sm:items-end'>
            <div
              className='flex items-center gap-2 rounded-lg border border-border/60 bg-background/70 px-2 py-1.5'
              onClick={(event) => event.stopPropagation()}
            >
              <Checkbox
                checked={on}
                onCheckedChange={(value) => onToggleEnabled(value === true)}
                aria-label={`启用 ${displayName}`}
              />
              <span className='text-xs text-muted-foreground'>启用</span>
            </div>
            <Button size='sm' variant='outline' className='gap-1.5'>
              <SlidersHorizontal className='size-3.5' />
              配置
            </Button>
          </div>
        </div>
      </div>

      <DialogContent className='max-h-[min(92svh,760px)] overflow-y-auto sm:max-w-3xl'>
        <DialogHeader className='gap-3'>
          <div className='flex items-start gap-3'>
            <div className='grid size-11 shrink-0 place-items-center rounded-xl bg-muted ring-1 ring-border/70'>
              <ModelVendorIcon modelId={model.id} className='size-6' />
            </div>
            <div className='min-w-0'>
              <DialogTitle className='truncate text-xl'>
                {displayName}
              </DialogTitle>
              <DialogDescription className='font-mono text-xs break-all'>
                {model.id}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className='grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]'>
          <section className='space-y-4'>
            <Panel
              title='模型覆写'
              icon={<SlidersHorizontal className='size-4' />}
            >
              <EditorRow label='对外启用'>
                <div className='flex items-center gap-2'>
                  <Checkbox
                    checked={on}
                    onCheckedChange={(value) => onToggleEnabled(value === true)}
                    aria-label='对外启用'
                  />
                  <span className='text-xs text-muted-foreground'>
                    关闭后仍保留配置，但不进入公开模型目录。
                  </span>
                </div>
              </EditorRow>
              <EditorRow label='上下文窗口'>
                <NumberInput
                  value={Number(caps.context_window || 0)}
                  onChange={(value) =>
                    onModel((rec) => {
                      rec.capabilities = {
                        ...(rec.capabilities || {}),
                        context_window: value,
                      }
                    })
                  }
                />
                <span className='text-xs text-muted-foreground'>token</span>
              </EditorRow>
              <div className='space-y-2'>
                <span className='text-xs font-medium text-muted-foreground'>
                  别名
                </span>
                <Textarea
                  className='min-h-24 font-mono text-xs'
                  value={(model.aliases || []).join('\n')}
                  placeholder='每行一个别名，例如 claude-haiku-5-5-private'
                  onChange={(event) =>
                    onModel((rec) => {
                      rec.aliases = splitList(event.target.value)
                    })
                  }
                />
              </div>
            </Panel>

            <Panel title='模型参数' icon={<Gauge className='size-4' />}>
              <EditorRow label='默认 max_tokens'>
                <NumberInput
                  value={params.max_tokens_default ?? 8192}
                  onChange={(value) => onParam('max_tokens_default', value)}
                />
              </EditorRow>
              <EditorRow label='max_tokens 上限'>
                <NumberInput
                  value={params.max_tokens_cap ?? 64000}
                  onChange={(value) => onParam('max_tokens_cap', value)}
                />
              </EditorRow>
              <EditorRow label='fallback budget'>
                <NumberInput
                  value={fallback}
                  onChange={(value) =>
                    onParam('thinking_fallback_budget', value)
                  }
                />
              </EditorRow>
              <EditorRow label='adaptive'>
                <Select
                  value={params.on_adaptive || 'passthrough'}
                  onValueChange={(value) => onParam('on_adaptive', value)}
                >
                  <SelectTrigger className='h-8 w-full sm:w-[220px]'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='passthrough'>透传</SelectItem>
                    <SelectItem value='convert_to_enabled'>
                      转为 enabled + budget
                    </SelectItem>
                    <SelectItem value='strip'>剥离 thinking</SelectItem>
                  </SelectContent>
                </Select>
              </EditorRow>
              <EditorRow label='enabled'>
                <Select
                  value={onEnabled}
                  onValueChange={(value) => onParam('on_enabled', value)}
                >
                  <SelectTrigger className='h-8 w-full sm:w-[220px]'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='passthrough'>透传</SelectItem>
                    <SelectItem value='strip'>剥离 thinking</SelectItem>
                  </SelectContent>
                </Select>
              </EditorRow>
            </Panel>
          </section>

          <aside className='space-y-4'>
            {showBeta ? (
              <Panel
                title='官方 beta'
                icon={<Gauge className='size-4' />}
                compact
              >
                <Select
                  value={mode}
                  onValueChange={(value) => {
                    if (
                      value === 'true' ||
                      value === 'false' ||
                      value === 'inherit'
                    ) {
                      onPass1m(value)
                    }
                  }}
                >
                  <SelectTrigger
                    className={cn('h-9 w-full', inheritHit && 'text-primary')}
                    title={
                      inheritHit
                        ? '未设开关，命中回退通配'
                        : mode === 'true'
                          ? '矩阵指定透传'
                          : mode === 'false'
                            ? '矩阵指定剥离'
                            : '未设，走回退通配'
                    }
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='true'>透传 1M beta</SelectItem>
                    <SelectItem value='false'>剥离 1M beta</SelectItem>
                    <SelectItem value='inherit'>
                      {effective ? '通配 → 透传' : '通配 → 剥离'}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className='text-xs text-muted-foreground'>
                  Beta drop：<span className='font-mono'>{drop}</span>
                </p>
              </Panel>
            ) : null}

            <Panel
              title='价格 / 计费'
              icon={<BadgeDollarSign className='size-4' />}
              compact
            >
              <Fact label='标准' value={billing.source} />
              <Fact label='计价模型' value={billing.key} mono />
              <p className='text-xs leading-relaxed text-muted-foreground'>
                {billing.note}
              </p>
            </Panel>

            <Panel title='能力' icon={<Gauge className='size-4' />} compact>
              <Fact label='上下文' value={win.text} />
              <Fact label='Thinking' value={thinkingPolicyLabel(model)} />
              <Fact label='目录状态' value={live ? '对外可见' : '未进入目录'} />
            </Panel>
          </aside>
        </div>

        <DialogFooter className='items-center gap-2 sm:justify-between'>
          <p className='text-xs text-muted-foreground'>
            关闭弹窗不会保存；右上角「保存更改」才会写入策略。
          </p>
          <DialogClose asChild>
            <Button type='button' variant='outline'>
              完成
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Panel({
  title,
  icon,
  compact,
  children,
}: {
  title: string
  icon: ReactNode
  compact?: boolean
  children: ReactNode
}) {
  return (
    <div className='rounded-xl border border-border/70 bg-background/70 p-3'>
      <div className='mb-3 flex items-center gap-2 text-sm font-semibold'>
        <span className='text-muted-foreground'>{icon}</span>
        {title}
      </div>
      <div className={cn('space-y-3', compact && 'space-y-2')}>{children}</div>
    </div>
  )
}

function EditorRow({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className='grid gap-1.5 sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-center'>
      <span className='text-xs font-medium text-muted-foreground'>{label}</span>
      <div className='flex min-w-0 flex-wrap items-center gap-2'>
        {children}
      </div>
    </div>
  )
}

function Metric({
  label,
  value,
  strong,
}: {
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <div className='rounded-lg bg-muted/45 px-2.5 py-2'>
      <div className='text-[11px] text-muted-foreground'>{label}</div>
      <div
        className={cn('field-count mt-0.5 truncate', strong && 'font-semibold')}
      >
        {value}
      </div>
    </div>
  )
}

function Fact({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className='flex items-start justify-between gap-3 text-xs'>
      <span className='text-muted-foreground'>{label}</span>
      <span className={cn('text-right', mono && 'font-mono')}>{value}</span>
    </div>
  )
}

function NumberInput({
  value,
  onChange,
}: {
  value: number
  onChange: (value: number) => void
}) {
  return (
    <Input
      className='field-count h-8 w-full sm:w-[150px]'
      type='number'
      min={0}
      value={value}
      onChange={(event) => onChange(Number(event.target.value) || 0)}
    />
  )
}

function splitList(value: string): string[] {
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function formatK(value: number): string {
  if (value >= 1_000_000) return `${Math.floor(value / 1_000_000)}M`
  if (value >= 1000) return `${Math.floor(value / 1000)}K`
  return String(value)
}

function billingInfo(model: ModelEntry): {
  source: string
  key: string
  note: string
} {
  const id = model.id.toLowerCase()
  if (/^(gpt-|codex-)/.test(id)) {
    return {
      source: 'OpenAI official standard',
      key: model.family || 'openai',
      note: '计费按 OpenAI 官方价表和请求 service_tier 归档；未知模型保持未计价，不猜价。',
    }
  }
  if (id.includes('haiku-5-5')) {
    return {
      source: 'Anthropic official standard',
      key: 'haiku-5.5',
      note: 'Haiku 5.5 官方长上下文阈值是 100K；本策略把可见上下文与默认输出上限都收敛到 100K。',
    }
  }
  return {
    source: 'Anthropic official standard',
    key: model.family || 'anthropic',
    note: '价格由服务端官方价表计算；模型页只保存模型、参数、beta 与别名覆写。',
  }
}
