import { useState } from 'react'
import type { QuotaTierKey, QuotaTierPolicy } from '@/types/panel-vm'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CONC_STEPS, RPM_STEPS } from '@/features/vm/conc-rpm-editor'

const TIERS: [QuotaTierKey, string, string][] = [
  ['default', '默认', '未探测出等级的账号（unknown / 无凭证）'],
  ['pro', 'Pro', 'Fable 被套餐拒绝的账号'],
  ['max', 'Max', 'Fable 可用的账号'],
]

const TIER_DEFAULTS: Record<QuotaTierKey, QuotaTierPolicy> = {
  default: { max_concurrency: 2, max_rpm: 0, limit_5h: 0.85, limit_7d: 0.8 },
  pro: { max_concurrency: 2, max_rpm: 0, limit_5h: 0.85, limit_7d: 0.8 },
  max: { max_concurrency: 4, max_rpm: 0, limit_5h: 0.95, limit_7d: 0.95 },
}

export const SESSION_STEPS = [0, 1, 2, 4, 8, 12, 16, 20]
export const IDLE_STEPS: [number, string][] = [
  [1, '1 分钟'],
  [5, '5 分钟'],
  [15, '15 分钟'],
  [30, '30 分钟'],
  [60, '1 小时'],
]
// 30–100% in 5-point steps, matching the legacy ratio slider's snap-down rule
export const RATIO_STEPS = Array.from({ length: 15 }, (_, i) => 30 + i * 5)

function snapRatio(v: unknown, fallback: number): number {
  const n = Number(v)
  const base = Number.isFinite(n) ? n : fallback
  return Math.floor((Math.min(1, Math.max(0.3, base)) * 100) / 5) * 5
}

export function QuotaTierPane({
  tiers,
  defaultRpm,
  onChange,
}: {
  tiers: Record<string, QuotaTierPolicy>
  defaultRpm?: number
  onChange: (tier: QuotaTierKey, next: QuotaTierPolicy) => void
}) {
  const [tier, setTier] = useState<QuotaTierKey>('default')
  const t = tiers[tier] || {}
  const fallback = TIER_DEFAULTS[tier]
  const hint = TIERS.find(([k]) => k === tier)?.[2] || ''

  const set = (patch: QuotaTierPolicy) => onChange(tier, { ...t, ...patch })

  const conc = Number(t.max_concurrency ?? fallback.max_concurrency)
  const rpm = Number(t.max_rpm ?? defaultRpm ?? 0)
  const sessions = Number(t.max_sessions ?? 0)
  const idle = Number(t.session_idle_min ?? 5)
  const limit5h = snapRatio(t.limit_5h, fallback.limit_5h as number)
  const limit7d = snapRatio(t.limit_7d, fallback.limit_7d as number)

  return (
    <Card>
      <CardHeader className='pb-2'>
        <CardTitle className='text-sm'>分档配额</CardTitle>
      </CardHeader>
      <CardContent className='space-y-4'>
        <p className='text-xs text-muted-foreground'>
          只编当前档的 <code>tiers.*</code>。过 5h/7d
          硬闸写入受限并切号，不是调度关。 会话满员仍拒新请求，胶囊写「5h 限制 /
          会话已满」。
        </p>

        <Tabs value={tier} onValueChange={(v) => setTier(v as QuotaTierKey)}>
          <TabsList>
            {TIERS.map(([k, label]) => (
              <TabsTrigger key={k} value={k}>
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <p className='text-xs text-muted-foreground'>{hint}</p>

        <div className='grid gap-4 sm:grid-cols-2'>
          <div className='space-y-1.5'>
            <Label htmlFor='tier-5h'>5h 硬闸</Label>
            <Select
              value={String(limit5h)}
              onValueChange={(v) => set({ limit_5h: Number(v) / 100 })}
            >
              <SelectTrigger id='tier-5h'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RATIO_STEPS.map((p) => (
                  <SelectItem key={p} value={String(p)}>
                    {p}%
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className='space-y-1.5'>
            <Label htmlFor='tier-7d'>7d 硬闸</Label>
            <Select
              value={String(limit7d)}
              onValueChange={(v) => set({ limit_7d: Number(v) / 100 })}
            >
              <SelectTrigger id='tier-7d'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RATIO_STEPS.map((p) => (
                  <SelectItem key={p} value={String(p)}>
                    {p}%
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className='space-y-1.5'>
            <Label htmlFor='tier-conc'>账号并发</Label>
            <Select
              value={String(conc)}
              onValueChange={(v) => set({ max_concurrency: Number(v) })}
            >
              <SelectTrigger id='tier-conc'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONC_STEPS.filter(([v]) => v > 0).map(([v, l]) => (
                  <SelectItem key={v} value={String(v)}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className='space-y-1.5'>
            <Label htmlFor='tier-rpm'>账号 RPM</Label>
            <Select
              value={String(rpm)}
              onValueChange={(v) => set({ max_rpm: Number(v) })}
            >
              <SelectTrigger id='tier-rpm'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RPM_STEPS.map(([v, l]) => (
                  <SelectItem key={v} value={String(v)}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className='space-y-1.5'>
            <Label htmlFor='tier-sessions'>最大会话</Label>
            <Select
              value={String(sessions)}
              onValueChange={(v) => set({ max_sessions: Number(v) })}
            >
              <SelectTrigger id='tier-sessions'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SESSION_STEPS.map((v) => (
                  <SelectItem key={v} value={String(v)}>
                    {v === 0 ? '不限制' : String(v)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className='space-y-1.5'>
            <Label htmlFor='tier-idle'>会话空闲</Label>
            <Select
              value={String(idle)}
              onValueChange={(v) => set({ session_idle_min: Number(v) })}
            >
              <SelectTrigger id='tier-idle'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {IDLE_STEPS.map(([v, l]) => (
                  <SelectItem key={v} value={String(v)}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <p className='text-xs text-muted-foreground'>
          RPM 满了排队等窗口，不切号。过 5h/7d 闸写入受限并切号，不是调度关。 0
          为不限制。机器页改过并发 / RPM 或「配额」的槽位，改过的项保持槽位值。
        </p>
      </CardContent>
    </Card>
  )
}
