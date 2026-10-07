import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { JevInterceptConfig } from '@/types/panel-routing'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  FieldLine,
  Fold,
  FoldStack,
  Group,
  Segmented,
  ToggleItem,
  ToggleList,
} from '@/features/protocol/blocks'
import { jevInterceptQueryOptions } from '@/features/protocol/queries'

function linesOf(text: string) {
  return text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function JevInterceptCard() {
  const qc = useQueryClient()
  const q = useQuery(jevInterceptQueryOptions())
  const [draft, setDraft] = useState<JevInterceptConfig | null>(null)
  const [patternsText, setPatternsText] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [keysText, setKeysText] = useState('')
  const [clearKey, setClearKey] = useState(false)
  const [listed, setListed] = useState<string[]>([])

  useEffect(() => {
    if (!q.data) return
    setDraft(q.data)
    setPatternsText((q.data.patterns || []).join('\n'))
    setApiKey('')
    setKeysText('')
    setClearKey(false)
  }, [q.data])

  const save = useMutation({
    mutationFn: () => {
      if (!draft) throw new Error('没有可保存的配置')
      const body: Record<string, unknown> = {
        enabled: draft.enabled,
        hard_regex_enabled: draft.hard_regex_enabled,
        provider: draft.provider || 'jev',
        base_url: draft.base_url,
        model: draft.model,
        timeout_ms: Number(draft.timeout_ms),
        safety_instruction: draft.safety_instruction || '',
        safety_threshold: Number(draft.safety_threshold ?? 0.5),
        block_if_below: draft.block_if_below !== false,
        fail_open: draft.fail_open !== false,
        dedup_sec: Number(draft.dedup_sec ?? 60),
        max_state_chars: Number(draft.max_state_chars ?? 16000),
        expand_base64: draft.expand_base64 !== false,
        strip_reminders: draft.strip_reminders !== false,
        patterns: linesOf(patternsText),
      }
      const keys = linesOf(keysText).slice(0, 8)
      if (clearKey) body.api_keys = []
      else if (keys.length) body.api_keys = keys
      else if (apiKey.trim()) body.api_key = apiKey.trim()
      return api<JevInterceptConfig>('/api/panel/jev-intercept', {
        method: 'PUT',
        body: JSON.stringify(body),
      })
    },
    onSuccess: async (data) => {
      toast.success('已保存协议拦截')
      setDraft(data)
      setPatternsText((data.patterns || []).join('\n'))
      setApiKey('')
      setKeysText('')
      setClearKey(false)
      qc.setQueryData(jevInterceptQueryOptions().queryKey, data)
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const fetchModels = useMutation({
    mutationFn: () => {
      if (!draft?.base_url.trim()) throw new Error('先填模型地址')
      return api<{ models: string[] }>('/api/panel/jev-intercept/models', {
        method: 'POST',
        body: JSON.stringify({
          base_url: draft.base_url.trim(),
          api_key: apiKey.trim(),
          timeout_ms: Number(draft.timeout_ms) || 2000,
        }),
      })
    },
    onSuccess: (data) => {
      const ids = data.models || []
      setListed(ids)
      setDraft((prev) => {
        if (!prev || prev.model.trim()) return prev
        const preferred =
          prev.providers?.find((item) => item.id === (prev.provider || 'jev'))
            ?.default_model || ''
        const pick =
          (preferred && ids.includes(preferred) ? preferred : ids[0]) || ''
        return pick ? { ...prev, model: pick } : prev
      })
      toast.success(
        ids.length ? `拉到 ${ids.length} 个模型` : '上游没有返回模型'
      )
    },
    onError: (error: Error) => toast.error(error.message),
  })

  if (q.error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>协议拦截</CardTitle>
        </CardHeader>
        <CardContent className='text-sm text-destructive'>
          {(q.error as Error).message}
        </CardContent>
      </Card>
    )
  }
  if (!draft) return null

  const dirty =
    draft.enabled !== q.data?.enabled ||
    draft.hard_regex_enabled !== q.data?.hard_regex_enabled ||
    (draft.provider || 'jev') !== (q.data?.provider || 'jev') ||
    draft.base_url !== q.data?.base_url ||
    draft.model !== q.data?.model ||
    Number(draft.timeout_ms) !== q.data?.timeout_ms ||
    (draft.safety_instruction || '') !== (q.data?.safety_instruction || '') ||
    Number(draft.safety_threshold ?? 0.5) !==
      Number(q.data?.safety_threshold ?? 0.5) ||
    (draft.block_if_below !== false) !== (q.data?.block_if_below !== false) ||
    (draft.fail_open !== false) !== (q.data?.fail_open !== false) ||
    Number(draft.dedup_sec ?? 60) !== Number(q.data?.dedup_sec ?? 60) ||
    Number(draft.max_state_chars ?? 16000) !==
      Number(q.data?.max_state_chars ?? 16000) ||
    (draft.expand_base64 !== false) !== (q.data?.expand_base64 !== false) ||
    (draft.strip_reminders !== false) !== (q.data?.strip_reminders !== false) ||
    linesOf(patternsText).join('\n') !== (q.data?.patterns || []).join('\n') ||
    apiKey.trim().length > 0 ||
    linesOf(keysText).length > 0 ||
    clearKey

  const providers = [
    {
      id: 'jev' as const,
      label: 'Jev',
      default_model: 'jev-latest',
      default_base_url: 'https://api.typesafe.ai',
    },
    {
      id: 'laya' as const,
      label: 'Laya',
      default_model: '',
      default_base_url: 'http://127.0.0.1:8000',
    },
    {
      id: 'modernbert' as const,
      label: 'ModernBERT',
      default_model: 'english',
      default_base_url: 'http://127.0.0.1:8000',
    },
  ].map((item) => {
    const remote = (draft.providers || []).find((row) => row.id === item.id)
    return {
      ...item,
      ...remote,
      id: item.id,
      label: remote?.label || item.label,
      default_model: remote?.default_model ?? item.default_model,
      default_base_url: remote?.default_base_url || item.default_base_url,
    }
  })
  const provider = draft.provider || 'jev'
  const current = providers.find((item) => item.id === provider) || providers[0]
  const applyProvider = (id: JevInterceptConfig['provider']) => {
    const next = providers.find((item) => item.id === id) || current
    const base = draft.base_url.trim().replace(/\/+$/, '')
    const model = draft.model.trim()
    const baseIsDefault =
      !base ||
      providers.some(
        (item) => (item.default_base_url || '').replace(/\/+$/, '') === base
      )
    const modelIsDefault = providers.some(
      (item) => (item.default_model || '') === model
    )
    setListed([])
    setDraft({
      ...draft,
      provider: id,
      base_url: baseIsDefault ? next.default_base_url || '' : draft.base_url,
      model: modelIsDefault ? next.default_model || '' : draft.model,
    })
  }
  const restoreScore = () => {
    const defaults = draft.defaults
    setDraft({
      ...draft,
      safety_instruction: '',
      safety_threshold: defaults?.safety_threshold ?? 0.5,
      block_if_below: defaults?.block_if_below !== false,
      fail_open: defaults?.fail_open !== false,
      dedup_sec: defaults?.dedup_sec ?? 60,
      max_state_chars: defaults?.max_state_chars ?? 16000,
      expand_base64: defaults?.expand_base64 !== false,
      strip_reminders: defaults?.strip_reminders !== false,
    })
  }
  const customCount = linesOf(patternsText).length
  const builtinCount = (draft.builtin_patterns || []).length

  return (
    <Card>
      <CardHeader className='border-b'>
        <CardTitle>协议拦截</CardTitle>
        <CardDescription>
          硬正则先看用户正文。没有命中，再把这段话交给决策模型。
        </CardDescription>
        <CardAction>
          <Button
            size='sm'
            className='cursor-pointer'
            disabled={!dirty || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? '保存中' : '保存'}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className='space-y-8'>
        <Group title='连接'>
          <div className='space-y-4 rounded-xl border p-4'>
            <Segmented
              value={provider}
              options={providers.map((item) => ({
                value: item.id,
                label: item.label,
              }))}
              onChange={(id) => applyProvider(id)}
            />
            <div className='space-y-3'>
              <FieldLine label='地址' htmlFor='jev-base'>
                <div className='flex gap-2'>
                  <Input
                    id='jev-base'
                    className='font-mono'
                    value={draft.base_url}
                    placeholder={current.default_base_url || 'https://'}
                    onChange={(e) =>
                      setDraft({ ...draft, base_url: e.target.value })
                    }
                  />
                  <Button
                    type='button'
                    variant='outline'
                    className='shrink-0 cursor-pointer'
                    onClick={() =>
                      setDraft({
                        ...draft,
                        base_url: current.default_base_url || '',
                      })
                    }
                  >
                    默认
                  </Button>
                </div>
              </FieldLine>
              <FieldLine label='Key' htmlFor='jev-key'>
                <Input
                  id='jev-key'
                  type='password'
                  autoComplete='off'
                  value={apiKey}
                  placeholder={
                    draft.api_key_count
                      ? `已存 ${draft.api_key_count} 把，留空不改`
                      : '本地服务可留空'
                  }
                  onChange={(e) => {
                    setApiKey(e.target.value)
                    if (e.target.value) setClearKey(false)
                  }}
                />
              </FieldLine>
              <FieldLine label='模型' htmlFor='jev-model'>
                <div className='flex gap-2'>
                  <Input
                    id='jev-model'
                    className='font-mono'
                    value={draft.model}
                    placeholder={current.default_model || '留空则由上游路由'}
                    onChange={(e) =>
                      setDraft({ ...draft, model: e.target.value })
                    }
                  />
                  <Button
                    type='button'
                    variant='outline'
                    className='shrink-0 cursor-pointer'
                    loading={fetchModels.isPending}
                    disabled={fetchModels.isPending || !draft.base_url.trim()}
                    onClick={() => fetchModels.mutate()}
                  >
                    获取模型
                  </Button>
                </div>
              </FieldLine>
              <FieldLine label='超时' htmlFor='jev-timeout'>
                <Input
                  id='jev-timeout'
                  type='number'
                  min={200}
                  max={8000}
                  value={draft.timeout_ms}
                  onChange={(e) =>
                    setDraft({ ...draft, timeout_ms: Number(e.target.value) })
                  }
                />
              </FieldLine>
            </div>
            {listed.length ? (
              <div className='flex flex-wrap gap-1.5 border-t pt-3'>
                {listed.map((id) => (
                  <button
                    key={id}
                    type='button'
                    className={cn(
                      'cursor-pointer rounded-md px-2 py-1 font-mono text-xs transition-colors duration-200',
                      draft.model === id
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:text-foreground'
                    )}
                    onClick={() => setDraft({ ...draft, model: id })}
                  >
                    {id}
                  </button>
                ))}
              </div>
            ) : (
              <p className='border-t pt-3 text-xs text-muted-foreground'>
                获取模型会请求这个地址的 /v1/models。Key
                留空时用已保存的第一把。
              </p>
            )}
          </div>
          <FoldStack>
            <Fold
              flush
              title='多把 Key'
              meta={
                draft.api_key_count
                  ? `已存 ${draft.api_key_count} 把，失败后轮换`
                  : '最多 8 把'
              }
            >
              <div className='space-y-3'>
                <Textarea
                  id='jev-keys'
                  rows={3}
                  className='font-mono text-xs'
                  value={keysText}
                  placeholder='一行一把。填写后保存会整表替换'
                  onChange={(e) => {
                    setKeysText(e.target.value)
                    if (e.target.value.trim()) setClearKey(false)
                  }}
                />
                <ToggleItem
                  label='清除已存 Key'
                  desc='留空且不勾选则保持原密钥'
                >
                  <Switch
                    checked={clearKey}
                    disabled={!draft.api_key_set && !clearKey}
                    onCheckedChange={(v) => {
                      setClearKey(v)
                      if (v) {
                        setApiKey('')
                        setKeysText('')
                      }
                    }}
                  />
                </ToggleItem>
              </div>
            </Fold>
          </FoldStack>
        </Group>

        <Group title='何时拦截'>
          <ToggleList>
            <ToggleItem label='硬正则' desc='命中后 403，不 hop'>
              <Switch
                checked={draft.hard_regex_enabled}
                onCheckedChange={(v) =>
                  setDraft({ ...draft, hard_regex_enabled: v })
                }
              />
            </ToggleItem>
            <ToggleItem label='决策模型' desc='没配地址则跳过'>
              <Switch
                checked={draft.enabled}
                onCheckedChange={(v) => setDraft({ ...draft, enabled: v })}
              />
            </ToggleItem>
          </ToggleList>
        </Group>

        <p className='text-xs text-muted-foreground'>
          题目在「题库」里增删改。当前启用{' '}
          {(draft.question_bank || []).filter((item) => item.enabled).length}{' '}
          题，高分表示安全，任一题低于阈值就拦。
        </p>

        <Group
          title='打分'
          hint='一条 safety。相同正文在去重窗口内不再打模型。'
          action={
            <button
              type='button'
              className='cursor-pointer text-xs text-muted-foreground transition-colors duration-200 hover:text-foreground'
              onClick={restoreScore}
            >
              恢复默认
            </button>
          }
        >
          <div className='grid gap-3 sm:grid-cols-3'>
            <div className='space-y-1.5'>
              <Label htmlFor='jev-threshold'>阈值</Label>
              <Input
                id='jev-threshold'
                type='number'
                min={0}
                max={1}
                step={0.05}
                value={draft.safety_threshold ?? 0.5}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    safety_threshold: Number(e.target.value),
                  })
                }
              />
            </div>
            <div className='space-y-1.5'>
              <Label htmlFor='jev-dedup'>去重（秒）</Label>
              <Input
                id='jev-dedup'
                type='number'
                min={0}
                max={3600}
                value={draft.dedup_sec ?? 60}
                onChange={(e) =>
                  setDraft({ ...draft, dedup_sec: Number(e.target.value) })
                }
              />
            </div>
            <div className='space-y-1.5'>
              <Label htmlFor='jev-state'>送模上限</Label>
              <Input
                id='jev-state'
                type='number'
                min={256}
                max={64000}
                value={draft.max_state_chars ?? 16000}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    max_state_chars: Number(e.target.value),
                  })
                }
              />
            </div>
          </div>
          <ToggleList>
            <ToggleItem label='低于阈值拦截' desc='关掉则高于阈值才拦'>
              <Switch
                checked={draft.block_if_below !== false}
                onCheckedChange={(v) =>
                  setDraft({ ...draft, block_if_below: v })
                }
              />
            </ToggleItem>
            <ToggleItem label='失败放行' desc='关掉则打分失败也拦'>
              <Switch
                checked={draft.fail_open !== false}
                onCheckedChange={(v) => setDraft({ ...draft, fail_open: v })}
              />
            </ToggleItem>
            <ToggleItem label='展开 base64' desc='长文本还原后再看'>
              <Switch
                checked={draft.expand_base64 !== false}
                onCheckedChange={(v) =>
                  setDraft({ ...draft, expand_base64: v })
                }
              />
            </ToggleItem>
            <ToggleItem label='去掉 reminder' desc='提醒块不参与判断'>
              <Switch
                checked={draft.strip_reminders !== false}
                onCheckedChange={(v) =>
                  setDraft({ ...draft, strip_reminders: v })
                }
              />
            </ToggleItem>
          </ToggleList>
          <div className='space-y-1.5'>
            <Label htmlFor='jev-instruction'>自定义要求</Label>
            <Textarea
              id='jev-instruction'
              rows={2}
              value={draft.safety_instruction || ''}
              placeholder='留空则只用上面的题库。填写后会多问这一题'
              onChange={(e) =>
                setDraft({ ...draft, safety_instruction: e.target.value })
              }
            />
          </div>
        </Group>

        <Group
          title='规则'
          hint={`类别：${(draft.categories || []).join('、') || 'nsfw、distill、crack、jailbreak'}`}
        >
          <FoldStack>
            <Fold flush title='内置硬正则' meta={`${builtinCount} 条，不能删`}>
              <Textarea
                readOnly
                rows={8}
                className='font-mono text-xs'
                value={(draft.builtin_patterns || []).join('\n')}
              />
            </Fold>
            <Fold
              flush
              title='附加硬正则'
              meta={customCount ? `${customCount} 条` : '还没有'}
              defaultOpen={customCount > 0}
            >
              <Textarea
                id='jev-patterns'
                rows={6}
                className='font-mono text-xs'
                value={patternsText}
                onChange={(e) => setPatternsText(e.target.value)}
                placeholder='一行一条'
              />
            </Fold>
          </FoldStack>
        </Group>
      </CardContent>
    </Card>
  )
}
