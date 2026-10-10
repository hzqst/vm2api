import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { DistillRules } from '@/types/panel-routing'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { SaveBar } from '@/features/settings/save-bar'
import { Fold, FoldStack, Group, ToggleItem, ToggleList } from './blocks'
import { distillQueryOptions } from './queries'

function linesOf(text: string) {
  return text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
}

function fingerprintsOf(text: string) {
  return text
    .split(/\n---\n/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function DistillSettings({
  onDirtyChange,
}: {
  onDirtyChange: (dirty: boolean) => void
}) {
  const qc = useQueryClient()
  const q = useQuery(distillQueryOptions())
  const [draft, setDraft] = useState<DistillRules | null>(null)
  const [needlesText, setNeedlesText] = useState('')
  const [patternsText, setPatternsText] = useState('')
  const [fpText, setFpText] = useState('')

  const load = (data: DistillRules) => {
    setDraft({ ...data, skip_zero: data.skip_zero !== false })
    setNeedlesText(data.needles.join('\n'))
    setPatternsText((data.patterns || []).join('\n'))
    setFpText(data.fingerprints.join('\n---\n'))
  }
  useEffect(() => {
    if (q.data) load(q.data)
  }, [q.data])

  const dirty =
    !!draft &&
    JSON.stringify({
      ...draft,
      needles: linesOf(needlesText),
      patterns: linesOf(patternsText),
      fingerprints: fingerprintsOf(fpText),
    }) !== JSON.stringify({ ...q.data, skip_zero: q.data?.skip_zero !== false })
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange])

  const save = useMutation({
    mutationFn: () =>
      api<DistillRules>('/api/panel/distill', {
        method: 'PUT',
        body: JSON.stringify({
          ...draft,
          needles: linesOf(needlesText),
          patterns: linesOf(patternsText),
          fingerprints: fingerprintsOf(fpText),
        }),
      }),
    onSuccess: (data) => {
      toast.success('已保存蒸馏关')
      qc.setQueryData(distillQueryOptions().queryKey, data)
    },
    onError: (error: Error) => toast.error(error.message),
  })

  if (q.error) {
    return (
      <p className='p-4 text-sm text-destructive' role='alert'>
        {(q.error as Error).message}
      </p>
    )
  }
  if (!draft) return <div className='h-40 animate-pulse bg-muted/40' />

  const patch = (next: Partial<DistillRules>) => setDraft({ ...draft, ...next })
  const patchError = (next: Partial<DistillRules['error']>) =>
    patch({ error: { ...draft.error, ...next } })
  const patchStructure = (next: Partial<DistillRules['structure']>) =>
    patch({ structure: { ...draft.structure, ...next } })

  const needleCount = linesOf(needlesText).length
  const patternCount = linesOf(patternsText).length
  const fpCount = fingerprintsOf(fpText).length

  return (
    <div className='space-y-8 p-4'>
      <Group title='何时拦截' hint='OpenAI 平台模型不过这一关。'>
        <ToggleList>
          <ToggleItem label='拦截蒸馏请求' desc='关掉后内置蒸馏正则也停'>
            <Switch
              checked={draft.enabled}
              onCheckedChange={(v) => patch({ enabled: v })}
            />
          </ToggleItem>
          <ToggleItem label='官方客户端放行' desc='收割包装和正则仍拦'>
            <Switch
              checked={draft.skip_official}
              onCheckedChange={(v) => patch({ skip_official: v })}
            />
          </ToggleItem>
          <ToggleItem label='0 注入放行' desc='拒答缓存仍生效'>
            <Switch
              checked={draft.skip_zero !== false}
              onCheckedChange={(v) => patch({ skip_zero: v })}
            />
          </ToggleItem>
          <ToggleItem label='无工具才看结构' desc='带 tools 不当收割'>
            <Switch
              checked={draft.structure.require_no_tools}
              onCheckedChange={(v) => patchStructure({ require_no_tools: v })}
            />
          </ToggleItem>
          <ToggleItem label='单轮才看结构' desc='多轮对话不当收割'>
            <Switch
              checked={draft.structure.require_single_turn}
              onCheckedChange={(v) =>
                patchStructure({ require_single_turn: v })
              }
            />
          </ToggleItem>
          <ToggleItem label='结构特征 max_tokens 下限' desc='低于它不看结构'>
            <Input
              aria-label='结构特征 max_tokens 下限'
              className='w-24 text-right tabular-nums'
              type='number'
              min={256}
              value={draft.structure.min_max_tokens}
              onChange={(e) =>
                patchStructure({
                  min_max_tokens: Number(e.target.value) || 8192,
                })
              }
            />
          </ToggleItem>
        </ToggleList>
      </Group>

      <Group
        title='规则'
        hint='不要写单独的 distill，会误伤化学题；也不要写「请分步解答」。'
      >
        <FoldStack>
          <Fold
            flush
            title='拦截模板'
            meta={needleCount ? `${needleCount} 条` : '还没有'}
          >
            <p className='mb-2 text-xs text-muted-foreground'>一行一条。</p>
            <Textarea
              aria-label='拦截模板'
              className='min-h-36 font-mono text-xs'
              value={needlesText}
              onChange={(e) => setNeedlesText(e.target.value)}
            />
          </Fold>
          <Fold
            flush
            title='附加正则'
            meta={patternCount ? `${patternCount} 条` : '还没有'}
          >
            <p className='mb-2 text-xs text-muted-foreground'>
              一行一条。官方客户端和 0 注入也拦。内置蒸馏正则在「硬正则」关的
              distill 类别里。
            </p>
            <Textarea
              aria-label='附加正则'
              className='min-h-36 font-mono text-xs'
              value={patternsText}
              onChange={(e) => setPatternsText(e.target.value)}
            />
          </Fold>
          <Fold
            flush
            title='题目指纹'
            meta={fpCount ? `${fpCount} 题` : '还没有'}
          >
            <p className='mb-2 text-xs text-muted-foreground'>
              每题用 --- 分隔。题面包含这段就拦。
            </p>
            <Textarea
              aria-label='题目指纹'
              className='min-h-36 font-mono text-xs'
              value={fpText}
              onChange={(e) => setFpText(e.target.value)}
            />
          </Fold>
        </FoldStack>
      </Group>

      <Group title='返回给客户端'>
        <div className='grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)_minmax(0,1fr)]'>
          <div className='space-y-1.5'>
            <Label htmlFor='distill-status'>HTTP 状态</Label>
            <Input
              id='distill-status'
              type='number'
              min={400}
              max={599}
              value={draft.error.status}
              onChange={(e) =>
                patchError({ status: Number(e.target.value) || 403 })
              }
            />
          </div>
          <div className='space-y-1.5'>
            <Label htmlFor='distill-code'>错误 code</Label>
            <Input
              id='distill-code'
              className='font-mono'
              value={draft.error.code}
              onChange={(e) => patchError({ code: e.target.value })}
            />
          </div>
          <div className='space-y-1.5'>
            <Label htmlFor='distill-type'>错误 type</Label>
            <Input
              id='distill-type'
              className='font-mono'
              value={draft.error.type}
              onChange={(e) => patchError({ type: e.target.value })}
            />
          </div>
          <div className='space-y-1.5 sm:col-span-3'>
            <Label htmlFor='distill-message'>返回文案</Label>
            <Input
              id='distill-message'
              value={draft.error.message}
              onChange={(e) => patchError({ message: e.target.value })}
            />
          </div>
        </div>
      </Group>

      {dirty ? (
        <SaveBar
          saving={save.isPending}
          onSave={() => save.mutate()}
          onDiscard={() => q.data && load(q.data)}
        />
      ) : null}
    </div>
  )
}
