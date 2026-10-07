import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type {
  OpenAIQuotaPolicy,
  QuotaTierKey,
  QuotaTierPolicy,
  Vm,
} from '@/types/panel-vm'
import {
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  Gauge,
  Info,
  MessageSquare,
  ServerCog,
  type LucideIcon,
} from 'lucide-react'
import { isCodexVm } from '@/lib/vm-kind'
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
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { vmsListQueryOptions } from '@/features/vm/queries'
import {
  CONC_STEPS,
  RPM_STEPS,
  RATIO_STEPS,
  withCurrent,
} from '@/features/vm/scheduling-steps'
import {
  ChipGroup,
  PaneSection,
  SliderSetting,
  StepperSetting,
} from './scheduler-controls'

type Obj = Record<string, unknown>
type DialogKind = 'gates' | 'concurrency' | 'rpm' | 'sessions' | 'details'

const TIERS: { key: QuotaTierKey; label: string; hint: string }[] = [
  { key: 'default', label: '默认', hint: '未知套餐或没有凭证的账号' },
  { key: 'pro', label: 'Pro', hint: '普通 Claude 账号' },
  { key: 'max', label: 'Max', hint: 'Fable 可用的账号' },
]

const TIER_DEFAULTS: Record<
  QuotaTierKey,
  {
    max_concurrency: number
    max_rpm: number
    limit_5h: number
    limit_7d: number
  }
> = {
  default: { max_concurrency: 2, max_rpm: 0, limit_5h: 0.85, limit_7d: 0.8 },
  pro: { max_concurrency: 2, max_rpm: 0, limit_5h: 0.85, limit_7d: 0.8 },
  max: { max_concurrency: 4, max_rpm: 0, limit_5h: 0.95, limit_7d: 0.95 },
}

const OPENAI_DEFAULTS: OpenAIQuotaPolicy = {
  limit_5h: 1,
  limit_7d: 1,
  max_concurrency: 2,
  max_rpm: 0,
  max_sessions: 0,
}

const OPENAI_SESSION_STEPS: [number, string][] = [
  [0, '不限'],
  [1, '1'],
  [2, '2'],
  [4, '4'],
  [8, '8'],
  [16, '16'],
  [32, '32'],
  [64, '64'],
  [128, '128'],
  [256, '256'],
]

function numberOf(value: unknown, fallback: number): number {
  return Number.isFinite(Number(value)) ? Number(value) : fallback
}

function recordOf(value: unknown): Obj {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Obj)
    : {}
}

function cloneTiers(
  source: Record<string, QuotaTierPolicy>
): Record<QuotaTierKey, QuotaTierPolicy> {
  return Object.fromEntries(
    TIERS.map(({ key }) => [key, { ...(source[key] || {}) }])
  ) as Record<QuotaTierKey, QuotaTierPolicy>
}

function ratioOptions(current: number): [number, string][] {
  return withCurrent(
    RATIO_STEPS.map((value): [number, string] => [value, `${value}%`]),
    current
  )
}

function ratioValue(
  policy: QuotaTierPolicy,
  key: 'limit_5h' | 'limit_7d',
  fallback: number
) {
  return numberOf(policy[key], fallback) * 100
}

function formatRpm(value: number): string {
  return value === 0 ? '不限' : `${value}`
}

function tierSummary(
  tiers: Record<string, QuotaTierPolicy>,
  format: (policy: QuotaTierPolicy, key: QuotaTierKey) => string
) {
  return TIERS.map(
    ({ key, label }) => `${label} ${format(tiers[key] || {}, key)}`
  ).join(' · ')
}

function Summary({
  icon: Icon,
  title,
  value,
  desc,
  pending,
  buttonRef,
  disabled,
  onClick,
}: {
  icon: LucideIcon
  title: string
  value: ReactNode
  desc: string
  pending: boolean
  buttonRef: (node: HTMLButtonElement | null) => void
  disabled: boolean
  onClick: () => void
}) {
  return (
    <Button
      ref={buttonRef}
      type='button'
      variant='outline'
      disabled={disabled}
      onClick={onClick}
      className='h-auto min-h-24 min-w-0 justify-start gap-3 px-4 py-3 text-left'
    >
      <Icon className='size-4 shrink-0 text-primary' aria-hidden />
      <span className='min-w-0'>
        <span className='flex items-center gap-2 text-xs text-muted-foreground'>
          <span className='truncate'>{title}</span>
          {pending ? (
            <span className='shrink-0 rounded bg-[color:var(--status-caution)]/15 px-1.5 py-0.5 text-[10px] text-[color:var(--status-caution)]'>
              待保存
            </span>
          ) : null}
        </span>
        <span className='block text-sm leading-5 font-semibold break-words whitespace-normal'>
          {value}
        </span>
        <span className='block truncate text-xs font-normal text-muted-foreground'>
          {desc}
        </span>
      </span>
    </Button>
  )
}

function RatioSetting({
  id,
  label,
  value,
  fallback,
  onChange,
}: {
  id: string
  label: string
  value: number
  fallback: number
  onChange: (value: number) => void
}) {
  const percent = Math.round(value * 100)
  return (
    <div className='space-y-2'>
      <SliderSetting
        id={id}
        label={label}
        value={percent}
        min={30}
        max={100}
        step={1}
        format={(next) => `${next}%`}
        fallback={fallback * 100}
        onChange={(next) => onChange(next / 100)}
      />
      <ChipGroup
        label={`${label}常用值`}
        value={percent}
        options={ratioOptions(percent)}
        onChange={(next) => onChange(next / 100)}
      />
    </div>
  )
}

function TierTabs({
  tier,
  onTier,
}: {
  tier: QuotaTierKey
  onTier: (next: QuotaTierKey) => void
}) {
  return (
    <div className='space-y-2'>
      <div className='text-xs font-medium'>Claude 账号层级</div>
      <div
        className='flex flex-wrap gap-2'
        role='tablist'
        aria-label='Claude 账号层级'
      >
        {TIERS.map((item) => (
          <Button
            key={item.key}
            type='button'
            size='sm'
            variant={item.key === tier ? 'default' : 'outline'}
            role='tab'
            aria-selected={item.key === tier}
            className='min-h-11'
            onClick={() => onTier(item.key)}
          >
            {item.label}
          </Button>
        ))}
      </div>
      <p className='text-xs text-muted-foreground'>
        {TIERS.find((item) => item.key === tier)?.hint}
      </p>
    </div>
  )
}

function ClaudeGates({
  tier,
  tiers,
  quota,
  weeklyExpanded,
  onTier,
  onTierChange,
  onQuotaChange,
  onWeeklyExpanded,
}: {
  tier: QuotaTierKey
  tiers: Record<QuotaTierKey, QuotaTierPolicy>
  quota: Obj
  weeklyExpanded: boolean
  onTier: (next: QuotaTierKey) => void
  onTierChange: (patch: QuotaTierPolicy) => void
  onQuotaChange: (patch: Obj) => void
  onWeeklyExpanded: (next: boolean) => void
}) {
  const policy = tiers[tier] || {}
  const fallback = TIER_DEFAULTS[tier]
  const weekly = recordOf(quota.weekly_split)
  return (
    <div className='space-y-4'>
      <TierTabs tier={tier} onTier={onTier} />
      <div className='grid gap-4 sm:grid-cols-2'>
        <RatioSetting
          id={`claude-${tier}-5h`}
          label='5h 闸线'
          value={numberOf(policy.limit_5h, fallback.limit_5h)}
          fallback={fallback.limit_5h}
          onChange={(value) => onTierChange({ limit_5h: value })}
        />
        <RatioSetting
          id={`claude-${tier}-7d`}
          label='7d 闸线'
          value={numberOf(policy.limit_7d, fallback.limit_7d)}
          fallback={fallback.limit_7d}
          onChange={(value) => onTierChange({ limit_7d: value })}
        />
      </div>
      <div className='grid gap-3 sm:grid-cols-2'>
        <div className='flex items-center justify-between gap-4 rounded-lg border p-3'>
          <Label>5h 闸生效</Label>
          <Switch
            checked={quota.block_on_5h !== false}
            onCheckedChange={(block_on_5h) => onQuotaChange({ block_on_5h })}
          />
        </div>
        <div className='flex items-center justify-between gap-4 rounded-lg border p-3'>
          <Label>7d 闸生效</Label>
          <Switch
            checked={quota.block_on_7d !== false}
            onCheckedChange={(block_on_7d) => onQuotaChange({ block_on_7d })}
          />
        </div>
      </div>
      <div className='rounded-lg border'>
        <button
          type='button'
          className='flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left'
          aria-expanded={weeklyExpanded}
          onClick={() => onWeeklyExpanded(!weeklyExpanded)}
        >
          <span>
            <span className='block text-sm font-medium'>实验：周仓拆分</span>
            <span className='block text-xs text-muted-foreground'>
              保留当前固定份额行为，仅 Claude 可用。
            </span>
          </span>
          {weeklyExpanded ? (
            <ChevronDown className='size-4 shrink-0' aria-hidden />
          ) : (
            <ChevronRight className='size-4 shrink-0' aria-hidden />
          )}
        </button>
        {weeklyExpanded ? (
          <div className='space-y-3 border-t px-3 py-3'>
            <div className='flex items-center justify-between gap-4'>
              <div>
                <Label>启用周仓拆分</Label>
                <p className='text-xs text-muted-foreground'>
                  7d 余量按固定比例留给 Max/Fable。
                </p>
              </div>
              <Switch
                checked={weekly.enabled === true}
                onCheckedChange={(enabled) =>
                  onQuotaChange({
                    weekly_split: { ...weekly, enabled },
                  })
                }
              />
            </div>
            <SliderSetting
              id='claude-weekly-fable-share'
              label='Fable 份额'
              value={numberOf(weekly.fable_share, 0.5) * 100}
              min={0}
              max={100}
              step={5}
              format={(value) => `${value}%`}
              fallback={50}
              presets={[25, 50, 75]}
              onChange={(value) =>
                onQuotaChange({
                  weekly_split: { ...weekly, fable_share: value / 100 },
                })
              }
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}

function ClaudeConcurrency({
  tier,
  tiers,
  onTier,
  onChange,
}: {
  tier: QuotaTierKey
  tiers: Record<QuotaTierKey, QuotaTierPolicy>
  onTier: (next: QuotaTierKey) => void
  onChange: (patch: QuotaTierPolicy) => void
}) {
  const policy = tiers[tier] || {}
  const value = numberOf(
    policy.max_concurrency,
    TIER_DEFAULTS[tier].max_concurrency
  )
  return (
    <div className='space-y-4'>
      <TierTabs tier={tier} onTier={onTier} />
      <StepperSetting
        id={`claude-${tier}-concurrency`}
        label='执行并发'
        desc='每个账号的在飞请求数；Claude 分档至少保留 1 个。'
        value={value}
        min={1}
        max={256}
        fallback={TIER_DEFAULTS[tier].max_concurrency}
        onChange={(max_concurrency) => onChange({ max_concurrency })}
      />
      <ChipGroup
        label='Claude 执行并发常用值'
        value={value}
        options={withCurrent(
          CONC_STEPS.filter(([next]) => next > 0),
          value
        )}
        onChange={(max_concurrency) => onChange({ max_concurrency })}
      />
    </div>
  )
}

function ClaudeRpm({
  tier,
  tiers,
  onTier,
  onChange,
}: {
  tier: QuotaTierKey
  tiers: Record<QuotaTierKey, QuotaTierPolicy>
  onTier: (next: QuotaTierKey) => void
  onChange: (patch: QuotaTierPolicy) => void
}) {
  const policy = tiers[tier] || {}
  const value = numberOf(policy.max_rpm, TIER_DEFAULTS[tier].max_rpm)
  return (
    <div className='space-y-4'>
      <TierTabs tier={tier} onTier={onTier} />
      <StepperSetting
        id={`claude-${tier}-rpm`}
        label='请求速率'
        desc='每个账号每分钟启动数；0 = 不限。'
        value={value}
        min={0}
        max={1000000}
        unit='RPM'
        fallback={TIER_DEFAULTS[tier].max_rpm}
        onChange={(max_rpm) => onChange({ max_rpm })}
      />
      <ChipGroup
        label='Claude RPM 常用值'
        value={value}
        options={withCurrent(RPM_STEPS, value)}
        onChange={(max_rpm) => onChange({ max_rpm })}
      />
    </div>
  )
}

function OpenAIGates({
  policy,
  onChange,
}: {
  policy: OpenAIQuotaPolicy
  onChange: (patch: Partial<OpenAIQuotaPolicy>) => void
}) {
  return (
    <div className='space-y-4'>
      <div className='grid gap-4 sm:grid-cols-2'>
        <RatioSetting
          id='openai-5h'
          label='5h 本地闸线'
          value={policy.limit_5h}
          fallback={OPENAI_DEFAULTS.limit_5h}
          onChange={(limit_5h) => onChange({ limit_5h })}
        />
        <RatioSetting
          id='openai-7d'
          label='7d 本地闸线'
          value={policy.limit_7d}
          fallback={OPENAI_DEFAULTS.limit_7d}
          onChange={(limit_7d) => onChange({ limit_7d })}
        />
      </div>
      <p className='rounded-md border bg-muted/30 px-3 py-2 text-xs leading-5 text-muted-foreground'>
        本地闸线只提前停止普通准入，不能解除上游硬限制；缺少或过期的用量数据显示为未知。
      </p>
    </div>
  )
}

function OpenAICapacity({
  policy,
  onChange,
}: {
  policy: OpenAIQuotaPolicy
  onChange: (patch: Partial<OpenAIQuotaPolicy>) => void
}) {
  return (
    <div className='space-y-4'>
      <StepperSetting
        id='openai-concurrency'
        label='执行并发'
        desc='每个账号的在飞请求数；OpenAI 的 0 不表示不限。'
        value={policy.max_concurrency}
        min={1}
        max={256}
        fallback={OPENAI_DEFAULTS.max_concurrency}
        onChange={(max_concurrency) => onChange({ max_concurrency })}
      />
      <ChipGroup
        label='OpenAI 并发常用值'
        value={policy.max_concurrency}
        options={withCurrent(
          CONC_STEPS.filter(([value]) => value > 0),
          policy.max_concurrency
        )}
        onChange={(max_concurrency) => onChange({ max_concurrency })}
      />
    </div>
  )
}

function OpenAIRpm({
  policy,
  onChange,
}: {
  policy: OpenAIQuotaPolicy
  onChange: (patch: Partial<OpenAIQuotaPolicy>) => void
}) {
  return (
    <div className='space-y-4'>
      <StepperSetting
        id='openai-rpm'
        label='请求速率'
        desc='每个账号每分钟启动数；0 = 不限。'
        value={policy.max_rpm}
        min={0}
        max={1000000}
        unit='RPM'
        fallback={OPENAI_DEFAULTS.max_rpm}
        onChange={(max_rpm) => onChange({ max_rpm })}
      />
      <ChipGroup
        label='OpenAI RPM 常用值'
        value={policy.max_rpm}
        options={withCurrent(RPM_STEPS, policy.max_rpm)}
        onChange={(max_rpm) => onChange({ max_rpm })}
      />
    </div>
  )
}

function OpenAISessions({
  policy,
  onChange,
}: {
  policy: OpenAIQuotaPolicy
  onChange: (patch: Partial<OpenAIQuotaPolicy>) => void
}) {
  return (
    <div className='space-y-4'>
      <StepperSetting
        id='openai-sessions'
        label='会话容量'
        desc='每个账号的活跃对话窗口；0 = 不限，空闲 5 分钟后回收。'
        value={policy.max_sessions}
        min={0}
        max={256}
        fallback={OPENAI_DEFAULTS.max_sessions}
        onChange={(max_sessions) => onChange({ max_sessions })}
      />
      <ChipGroup
        label='OpenAI 会话容量常用值'
        value={policy.max_sessions}
        options={withCurrent(OPENAI_SESSION_STEPS, policy.max_sessions)}
        onChange={(max_sessions) => onChange({ max_sessions })}
      />
      <p className='rounded-md border bg-muted/30 px-3 py-2 text-xs leading-5 text-muted-foreground'>
        会话窗口的空闲回收仍固定为 5 分钟；这里不编辑选择策略或队列上限。
      </p>
    </div>
  )
}

function PlatformDetails({
  platform,
  items,
  loading,
  error,
}: {
  platform: 'claude' | 'openai'
  items: Vm[]
  loading: boolean
  error: unknown
}) {
  if (loading) {
    return (
      <p className='rounded-md border px-3 py-6 text-center text-sm text-muted-foreground'>
        读取账号状态中…
      </p>
    )
  }
  if (error) {
    return (
      <div className='flex items-start gap-2 rounded-md border border-[color:var(--status-bad)]/40 px-3 py-3 text-sm text-[color:var(--status-bad)]'>
        <CircleAlert className='mt-0.5 size-4 shrink-0' aria-hidden />
        <span>
          账号状态读取失败：
          {error instanceof Error ? error.message : String(error)}
        </span>
      </div>
    )
  }
  if (!items.length) {
    return (
      <div className='rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground'>
        当前没有 {platform === 'claude' ? 'Claude' : 'OpenAI'}{' '}
        VM；全局策略仍可保存。
      </div>
    )
  }
  return (
    <div className='space-y-2'>
      {items.map((vm) => {
        const hasSource =
          platform === 'claude'
            ? Object.keys(recordOf(vm.quota_override)).length > 0
            : vm.concurrency_override === true ||
              vm.rpm_override === true ||
              vm.max_sessions_override === true
        const status = vm.availability?.text || vm.status || '状态未知'
        return (
          <div
            key={vm.id}
            className='flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2.5'
          >
            <div className='max-w-full min-w-0 flex-1 basis-40'>
              <div className='truncate text-sm font-medium' title={vm.id}>
                {vm.name || vm.id}
              </div>
              <div className='mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground'>
                <span>来源：{hasSource ? '本槽覆盖' : '跟随全局'}</span>
                <span>状态：{status}</span>
              </div>
            </div>
            <Link
              to='/vm/$id'
              params={{ id: vm.id }}
              className='inline-flex min-h-11 items-center gap-1 text-xs text-primary hover:underline'
            >
              查看 VM 调度
            </Link>
          </div>
        )
      })}
    </div>
  )
}

export function QuotaTierPane({
  tiers,
  quota,
  onChange,
  onQuotaChange,
  codexQuota,
  onCodexQuotaChange,
  saving = false,
  pending = false,
}: {
  tiers: Record<string, QuotaTierPolicy>
  quota: Obj
  onChange: (tier: QuotaTierKey, patch: QuotaTierPolicy) => void
  onQuotaChange: (patch: Obj) => void
  codexQuota: Partial<OpenAIQuotaPolicy>
  onCodexQuotaChange: (patch: Partial<OpenAIQuotaPolicy>) => void
  saving?: boolean
  pending?: boolean
}) {
  const list = useQuery(vmsListQueryOptions(5000))
  const [platform, setPlatform] = useState<'claude' | 'openai'>('claude')
  const [dialog, setDialog] = useState<DialogKind | null>(null)
  const [tier, setTier] = useState<QuotaTierKey>('default')
  const [draftTiers, setDraftTiers] = useState<
    Record<QuotaTierKey, QuotaTierPolicy>
  >(cloneTiers(tiers))
  const [draftQuota, setDraftQuota] = useState<Obj>({ ...quota })
  const [draftCodex, setDraftCodex] = useState<OpenAIQuotaPolicy>({
    ...OPENAI_DEFAULTS,
    ...codexQuota,
  })
  const [weeklyExpanded, setWeeklyExpanded] = useState(false)
  const triggerRefs = useRef<
    Partial<Record<DialogKind, HTMLButtonElement | null>>
  >({})
  const previousDialog = useRef<DialogKind | null>(null)

  useEffect(() => {
    if (previousDialog.current && !dialog) {
      triggerRefs.current[previousDialog.current]?.focus()
    }
    previousDialog.current = dialog
  }, [dialog])

  const openDialog = (kind: DialogKind) => {
    if (saving) return
    setDraftTiers(cloneTiers(tiers))
    setDraftQuota({ ...quota })
    setDraftCodex({ ...OPENAI_DEFAULTS, ...codexQuota })
    setTier('default')
    setWeeklyExpanded(false)
    setDialog(kind)
  }
  const closeDialog = () => {
    if (!saving) setDialog(null)
  }
  const apply = () => {
    if (!dialog || saving) return
    if (dialog === 'details') {
      closeDialog()
      return
    }
    if (platform === 'claude') {
      if (dialog === 'gates') {
        TIERS.forEach(({ key }) => {
          const policy = draftTiers[key] || {}
          onChange(key, {
            limit_5h: numberOf(policy.limit_5h, TIER_DEFAULTS[key].limit_5h),
            limit_7d: numberOf(policy.limit_7d, TIER_DEFAULTS[key].limit_7d),
          })
        })
        const weekly = recordOf(draftQuota.weekly_split)
        onQuotaChange({
          block_on_5h: draftQuota.block_on_5h !== false,
          block_on_7d: draftQuota.block_on_7d !== false,
          weekly_split: {
            ...weekly,
            enabled: weekly.enabled === true,
            fable_share: numberOf(weekly.fable_share, 0.5),
          },
        })
      } else if (dialog === 'concurrency') {
        TIERS.forEach(({ key }) => {
          const policy = draftTiers[key] || {}
          onChange(key, {
            max_concurrency: numberOf(
              policy.max_concurrency,
              TIER_DEFAULTS[key].max_concurrency
            ),
          })
        })
      } else if (dialog === 'rpm') {
        TIERS.forEach(({ key }) => {
          const policy = draftTiers[key] || {}
          onChange(key, {
            max_rpm: numberOf(policy.max_rpm, TIER_DEFAULTS[key].max_rpm),
          })
        })
      }
    } else if (dialog === 'gates') {
      onCodexQuotaChange({
        limit_5h: draftCodex.limit_5h,
        limit_7d: draftCodex.limit_7d,
      })
    } else if (dialog === 'concurrency') {
      onCodexQuotaChange({ max_concurrency: draftCodex.max_concurrency })
    } else if (dialog === 'rpm') {
      onCodexQuotaChange({ max_rpm: draftCodex.max_rpm })
    } else if (dialog === 'sessions') {
      onCodexQuotaChange({ max_sessions: draftCodex.max_sessions })
    }
    setDialog(null)
  }

  const claudeItems = (list.data?.items || []).filter((vm) => !isCodexVm(vm))
  const openaiItems = (list.data?.items || []).filter((vm) => isCodexVm(vm))
  const effectiveCodex = { ...OPENAI_DEFAULTS, ...codexQuota }
  const activeItems = platform === 'claude' ? claudeItems : openaiItems
  const title =
    dialog === 'gates'
      ? '配额闸线'
      : dialog === 'concurrency'
        ? '执行并发'
        : dialog === 'rpm'
          ? '请求速率'
          : dialog === 'sessions'
            ? '会话容量'
            : '生效账号与本槽覆盖'

  const renderSummary = (currentPlatform: 'claude' | 'openai') => {
    const claude = currentPlatform === 'claude'
    return (
      <PaneSection
        icon={Gauge}
        title={`${claude ? 'Claude' : 'OpenAI'} 配额`}
        desc={`${claude ? claudeItems.length : openaiItems.length} 个账号；当前页面只编辑所选平台。`}
      >
        <div className='grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-4'>
          <Summary
            icon={Clock3}
            title='配额闸线'
            value={
              claude
                ? tierSummary(tiers, (policy, key) => {
                    const fallback = TIER_DEFAULTS[key]
                    return `${Math.round(ratioValue(policy, 'limit_5h', fallback.limit_5h))}% / ${Math.round(ratioValue(policy, 'limit_7d', fallback.limit_7d))}%`
                  })
                : `${Math.round(effectiveCodex.limit_5h * 100)}% / ${Math.round(effectiveCodex.limit_7d * 100)}%`
            }
            desc='5h / 7d，本地软闸'
            pending={pending}
            buttonRef={(node) => {
              triggerRefs.current.gates = node
            }}
            disabled={saving}
            onClick={() => openDialog('gates')}
          />
          <Summary
            icon={ServerCog}
            title='执行并发'
            value={
              claude
                ? tierSummary(
                    tiers,
                    (policy, key) =>
                      `${numberOf(policy.max_concurrency, TIER_DEFAULTS[key].max_concurrency)}`
                  )
                : String(effectiveCodex.max_concurrency)
            }
            desc='每个账号的在飞请求数'
            pending={pending}
            buttonRef={(node) => {
              triggerRefs.current.concurrency = node
            }}
            disabled={saving}
            onClick={() => openDialog('concurrency')}
          />
          <Summary
            icon={Gauge}
            title='请求速率'
            value={
              claude
                ? tierSummary(tiers, (policy, key) =>
                    formatRpm(
                      numberOf(policy.max_rpm, TIER_DEFAULTS[key].max_rpm)
                    )
                  )
                : formatRpm(effectiveCodex.max_rpm)
            }
            desc='满后排队，不切号；0 = 不限'
            pending={pending}
            buttonRef={(node) => {
              triggerRefs.current.rpm = node
            }}
            disabled={saving}
            onClick={() => openDialog('rpm')}
          />
          {!claude ? (
            <Summary
              icon={MessageSquare}
              title='会话容量'
              value={
                effectiveCodex.max_sessions
                  ? String(effectiveCodex.max_sessions)
                  : '不限'
              }
              desc='活跃对话窗口，5 分钟空闲回收'
              pending={pending}
              buttonRef={(node) => {
                triggerRefs.current.sessions = node
              }}
              disabled={saving}
              onClick={() => openDialog('sessions')}
            />
          ) : null}
        </div>
        <Button
          ref={(node) => {
            triggerRefs.current.details = node
          }}
          type='button'
          variant='ghost'
          disabled={saving}
          className='mt-3 h-auto min-h-11 w-full items-start justify-start gap-2 px-2 py-3 text-left whitespace-normal'
          onClick={() => openDialog('details')}
        >
          <Info className='size-4 text-muted-foreground' aria-hidden />
          <span className='min-w-0 flex-1'>
            <span className='block text-sm font-medium'>
              生效账号与本槽覆盖
            </span>
            <span className='block text-xs font-normal text-muted-foreground'>
              查看来源、运行状态，并进入单槽 VM 调度；这里不复制逐槽编辑器。
            </span>
          </span>
        </Button>
      </PaneSection>
    )
  }

  return (
    <div className='space-y-4'>
      <Tabs
        value={platform}
        onValueChange={(value) => setPlatform(value as 'claude' | 'openai')}
      >
        <TabsList aria-label='配额平台'>
          <TabsTrigger value='claude'>Claude</TabsTrigger>
          <TabsTrigger value='openai'>OpenAI</TabsTrigger>
        </TabsList>
        <TabsContent value='claude'>{renderSummary('claude')}</TabsContent>
        <TabsContent value='openai'>{renderSummary('openai')}</TabsContent>
      </Tabs>

      <Dialog
        open={dialog !== null}
        onOpenChange={(next) => {
          if (!next && !saving) closeDialog()
        }}
      >
        <DialogContent
          showCloseButton={!saving}
          className='flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-2xl'
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              应用到草稿后，全局保存才会生效；运行中的账号状态始终来自实时 VM
              数据。
            </DialogDescription>
          </DialogHeader>
          <fieldset
            disabled={saving}
            className='min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto pr-1'
          >
            {dialog === 'gates' && platform === 'claude' ? (
              <ClaudeGates
                tier={tier}
                tiers={draftTiers}
                quota={draftQuota}
                weeklyExpanded={weeklyExpanded}
                onTier={setTier}
                onTierChange={(patch) =>
                  setDraftTiers((current) => ({
                    ...current,
                    [tier]: { ...current[tier], ...patch },
                  }))
                }
                onQuotaChange={(patch) =>
                  setDraftQuota((current) => ({
                    ...current,
                    ...patch,
                  }))
                }
                onWeeklyExpanded={setWeeklyExpanded}
              />
            ) : null}
            {dialog === 'gates' && platform === 'openai' ? (
              <OpenAIGates
                policy={draftCodex}
                onChange={(patch) =>
                  setDraftCodex((current) => ({ ...current, ...patch }))
                }
              />
            ) : null}
            {dialog === 'concurrency' && platform === 'claude' ? (
              <ClaudeConcurrency
                tier={tier}
                tiers={draftTiers}
                onTier={setTier}
                onChange={(patch) =>
                  setDraftTiers((current) => ({
                    ...current,
                    [tier]: { ...current[tier], ...patch },
                  }))
                }
              />
            ) : null}
            {dialog === 'rpm' && platform === 'claude' ? (
              <ClaudeRpm
                tier={tier}
                tiers={draftTiers}
                onTier={setTier}
                onChange={(patch) =>
                  setDraftTiers((current) => ({
                    ...current,
                    [tier]: { ...current[tier], ...patch },
                  }))
                }
              />
            ) : null}
            {dialog === 'concurrency' && platform === 'openai' ? (
              <OpenAICapacity
                policy={draftCodex}
                onChange={(patch) =>
                  setDraftCodex((current) => ({ ...current, ...patch }))
                }
              />
            ) : null}
            {dialog === 'rpm' && platform === 'openai' ? (
              <OpenAIRpm
                policy={draftCodex}
                onChange={(patch) =>
                  setDraftCodex((current) => ({ ...current, ...patch }))
                }
              />
            ) : null}
            {dialog === 'sessions' ? (
              <OpenAISessions
                policy={draftCodex}
                onChange={(patch) =>
                  setDraftCodex((current) => ({ ...current, ...patch }))
                }
              />
            ) : null}
            {dialog === 'details' ? (
              <PlatformDetails
                platform={platform}
                items={activeItems}
                loading={list.isLoading}
                error={list.error}
              />
            ) : null}
          </fieldset>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              disabled={saving}
              className='min-h-11'
              onClick={closeDialog}
            >
              {dialog === 'details' ? '关闭' : '取消'}
            </Button>
            {dialog !== 'details' ? (
              <Button
                type='button'
                disabled={saving}
                className='min-h-11'
                onClick={apply}
              >
                应用到草稿
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
