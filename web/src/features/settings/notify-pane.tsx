import { useMutation, useQuery } from '@tanstack/react-query'
import type {
  NotifyConfig,
  NotifyEvents,
  NotifyTelegramConfig,
} from '@/types/panel-routing'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { fmtExpiresAt } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { SettingRow } from '@/components/setting-row'
import { StatusMark } from '@/components/status-mark'
import { notifyQueryOptions } from '@/features/settings/queries'

const DEFAULT_EVENTS: NotifyEvents = {
  pool_empty: true,
  pool_low: true,
  pool_recovered: true,
  digest: true,
  revoked: true,
  invalid: true,
  account_down: false,
  account_up: false,
}

const EVENT_FIELDS: {
  key: keyof NotifyEvents
  label: string
  desc: string
}[] = [
  { key: 'pool_empty', label: '账号池清空', desc: '可用账号降到 0' },
  { key: 'pool_low', label: '账号池偏低', desc: '低于最小可用数' },
  { key: 'pool_recovered', label: '账号池恢复', desc: '从低水位恢复' },
  { key: 'digest', label: '定时汇报', desc: '按汇报间隔发送摘要' },
  { key: 'revoked', label: '凭证吊销', desc: '发现新的吊销账号' },
  { key: 'invalid', label: '凭证失效', desc: '发现新的失效凭证' },
  { key: 'account_down', label: '账号离线', desc: '单个账号变为不可用' },
  { key: 'account_up', label: '账号上线', desc: '单个账号恢复可用' },
]

function notifyConfig(value: NotifyConfig | undefined): NotifyConfig {
  return {
    enabled: false,
    interval_sec: 60,
    cooldown_sec: 300,
    digest_sec: 21600,
    min_available: 1,
    run_on_start: true,
    console_url: '',
    ...value,
    events: { ...DEFAULT_EVENTS, ...(value?.events || {}) },
    telegram: {
      enabled: false,
      bot_token: '',
      chat_id: '',
      ...(value?.telegram || {}),
    },
  }
}

function NumberField({
  ariaLabel,
  value,
  min,
  max,
  onChange,
}: {
  ariaLabel: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <Input
      className='w-28 tabular-nums'
      type='number'
      aria-label={ariaLabel}
      min={min}
      max={max}
      value={value}
      onChange={(event) => onChange(Number(event.target.value) || min)}
    />
  )
}

export function NotifyPane({
  value,
  onChange,
}: {
  value: NotifyConfig | undefined
  onChange: (next: NotifyConfig) => void
}) {
  const config = notifyConfig(value)
  const telegram = config.telegram
  const status = useQuery(notifyQueryOptions())

  const testTelegram = useMutation({
    mutationFn: () => {
      if (!telegram.bot_token.trim() && !telegram.bot_token_set) {
        throw new Error('先填写 Bot token')
      }
      if (!telegram.chat_id.trim()) throw new Error('先填写 Chat ID')
      return api('/api/panel/notify/test', {
        method: 'POST',
        body: JSON.stringify({
          channel: 'telegram',
          telegram: { ...telegram, enabled: true },
        }),
      })
    },
    onSuccess: async () => {
      toast.success('测试 Telegram 已发送')
      await status.refetch()
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const patch = (next: Partial<NotifyConfig>) =>
    onChange({ ...config, ...next })
  const patchTelegram = (next: Partial<NotifyTelegramConfig>) =>
    patch({ telegram: { ...telegram, ...next } })
  const patchEvent = (key: keyof NotifyEvents, enabled: boolean) =>
    patch({ events: { ...config.events, [key]: enabled } })

  return (
    <>
      <Card>
        <CardHeader className='flex flex-row items-center justify-between gap-3'>
          <CardTitle>通知状态</CardTitle>
          <Button
            variant='outline'
            size='sm'
            loading={status.isFetching}
            onClick={() => status.refetch()}
          >
            刷新状态
          </Button>
        </CardHeader>
        <CardContent className='space-y-3'>
          <div className='flex flex-wrap items-center gap-x-6 gap-y-2 text-sm'>
            <StatusMark
              tone={
                status.data?.channels?.telegram
                  ? {
                      key: 'telegram-ready',
                      cls: 'ok',
                      text: 'Telegram 已就绪',
                    }
                  : {
                      key: 'telegram-missing',
                      cls: 'none',
                      text: 'Telegram 未就绪',
                    }
              }
              variant='pill'
            />
            <span className='text-muted-foreground'>
              上次检查 {fmtExpiresAt(status.data?.last_run_at)}
            </span>
          </div>
          {status.error ? (
            <p role='alert' className='text-sm text-destructive'>
              无法读取通知状态：{(status.error as Error).message}
            </p>
          ) : null}
          {status.data?.last_error ? (
            <p role='alert' className='text-sm text-destructive'>
              上次错误：{status.data.last_error}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>通知策略</CardTitle>
        </CardHeader>
        <CardContent className='divide-y'>
          <SettingRow label='启用通知' desc='按账号池状态与事件规则发送通知'>
            <Switch
              checked={config.enabled}
              aria-label='启用通知'
              onCheckedChange={(enabled) => patch({ enabled })}
            />
          </SettingRow>
          <SettingRow label='启动即检查' desc='网关重启后立即检查一次账号池'>
            <Switch
              checked={config.run_on_start}
              aria-label='启动即检查'
              onCheckedChange={(run_on_start) => patch({ run_on_start })}
            />
          </SettingRow>
          <SettingRow label='检查间隔' desc='秒，最小 15'>
            <NumberField
              ariaLabel='检查间隔（秒）'
              value={config.interval_sec}
              min={15}
              max={86400}
              onChange={(interval_sec) => patch({ interval_sec })}
            />
          </SettingRow>
          <SettingRow label='通知冷却' desc='秒，同类事件的最小发送间隔'>
            <NumberField
              ariaLabel='通知冷却（秒）'
              value={config.cooldown_sec}
              min={30}
              max={86400}
              onChange={(cooldown_sec) => patch({ cooldown_sec })}
            />
          </SettingRow>
          <SettingRow label='汇报间隔' desc='秒，最小 300'>
            <NumberField
              ariaLabel='汇报间隔（秒）'
              value={config.digest_sec}
              min={300}
              max={86400}
              onChange={(digest_sec) => patch({ digest_sec })}
            />
          </SettingRow>
          <SettingRow label='最小可用数' desc='低于该数量触发账号池偏低'>
            <NumberField
              ariaLabel='最小可用数'
              value={config.min_available}
              min={1}
              max={1000}
              onChange={(min_available) => patch({ min_available })}
            />
          </SettingRow>
          <SettingRow
            label='控制台地址'
            desc='通知消息中的回跳链接，留空使用后端地址'
          >
            <Input
              aria-label='控制台地址'
              className='w-full min-w-56 sm:w-80'
              maxLength={200}
              placeholder={location.origin}
              value={config.console_url}
              onChange={(event) => patch({ console_url: event.target.value })}
            />
          </SettingRow>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>事件</CardTitle>
        </CardHeader>
        <CardContent className='divide-y'>
          {EVENT_FIELDS.map((field) => (
            <SettingRow key={field.key} label={field.label} desc={field.desc}>
              <Switch
                checked={config.events[field.key]}
                aria-label={field.label}
                onCheckedChange={(enabled) => patchEvent(field.key, enabled)}
              />
            </SettingRow>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className='flex flex-row items-center justify-between gap-3'>
          <CardTitle>Telegram Bot</CardTitle>
          <Button
            variant='outline'
            size='sm'
            loading={testTelegram.isPending}
            onClick={() => testTelegram.mutate()}
          >
            发送测试
          </Button>
        </CardHeader>
        <CardContent className='divide-y'>
          <SettingRow label='启用 Telegram' desc='保存后纳入定时通知通道'>
            <Switch
              checked={telegram.enabled}
              aria-label='启用 Telegram'
              onCheckedChange={(enabled) => patchTelegram({ enabled })}
            />
          </SettingRow>
          <SettingRow
            label='Bot token'
            desc={
              telegram.bot_token_set
                ? '已保存；留空不会覆盖现有 token'
                : '从 BotFather 获取，保存后不再回显'
            }
          >
            <Input
              aria-label='Bot token'
              className='w-full min-w-56 sm:w-80'
              type='password'
              autoComplete='new-password'
              maxLength={500}
              placeholder={
                telegram.bot_token_set ? '已保存，留空不改' : '123456:AA…'
              }
              value={telegram.bot_token}
              onChange={(event) =>
                patchTelegram({ bot_token: event.target.value })
              }
            />
          </SettingRow>
          <SettingRow label='Chat ID' desc='个人 ID 或以 -100 开头的群 ID'>
            <Input
              aria-label='Chat ID'
              className='w-full min-w-56 sm:w-80'
              maxLength={80}
              placeholder='-100…'
              value={telegram.chat_id}
              onChange={(event) =>
                patchTelegram({ chat_id: event.target.value })
              }
            />
          </SettingRow>
        </CardContent>
      </Card>
    </>
  )
}
