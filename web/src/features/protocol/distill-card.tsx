import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { DistillRules } from '@/types/panel-routing'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { SettingRow } from '@/components/setting-row'
import { Fold, Group } from '@/features/protocol/blocks'
import { distillQueryOptions } from '@/features/protocol/queries'

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

export function DistillCard() {
  const qc = useQueryClient()
  const q = useQuery(distillQueryOptions())
  const [draft, setDraft] = useState<DistillRules | null>(null)
  const [needlesText, setNeedlesText] = useState('')
  const [patternsText, setPatternsText] = useState('')
  const [fpText, setFpText] = useState('')
  useEffect(() => {
    if (!q.data) return
    setDraft({ ...q.data, skip_zero: q.data.skip_zero !== false })
    setNeedlesText(q.data.needles.join('\n'))
    setPatternsText((q.data.patterns || []).join('\n'))
    setFpText(q.data.fingerprints.join('\n---\n'))
  }, [q.data])

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
    onSuccess: async (data) => {
      toast.success('已保存蒸馏拦截')
      setDraft(data)
      setNeedlesText(data.needles.join('\n'))
      setPatternsText((data.patterns || []).join('\n'))
      setFpText(data.fingerprints.join('\n---\n'))
      await qc.invalidateQueries({ queryKey: distillQueryOptions().queryKey })
    },
    onError: (error: Error) => toast.error(error.message),
  })

  if (q.error) {
    return (
      <p className='text-sm text-destructive'>{(q.error as Error).message}</p>
    )
  }
  if (!draft) return null

  const dirty =
    JSON.stringify({
      ...draft,
      needles: linesOf(needlesText),
      patterns: linesOf(patternsText),
      fingerprints: fingerprintsOf(fpText),
    }) !== JSON.stringify(q.data)
  const patch = (next: Partial<DistillRules>) => setDraft({ ...draft, ...next })
  const patchError = (next: Partial<DistillRules['error']>) =>
    patch({ error: { ...draft.error, ...next } })
  const patchStructure = (next: Partial<DistillRules['structure']>) =>
    patch({ structure: { ...draft.structure, ...next } })

  const needleCount = linesOf(needlesText).length
  const patternCount = linesOf(patternsText).length
  const fpCount = fingerprintsOf(fpText).length

  return (
    <Card>
      <CardHeader className='border-b'>
        <CardTitle>蒸馏拦截</CardTitle>
        <CardDescription>
          命中后直接返回错误，不打凭证、不 hop。OpenAI 平台模型不拦截。
        </CardDescription>
        <div className='flex flex-wrap items-center gap-2'>
          <Badge variant={draft.enabled ? 'secondary' : 'outline'}>
            {draft.enabled ? '开' : '关'}
          </Badge>
          <Button
            size='sm'
            className='ms-auto cursor-pointer'
            disabled={!dirty || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? '保存中' : '保存'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className='space-y-6'>
        <Group title='何时拦截'>
          <div className='grid gap-3 md:grid-cols-2'>
            <div className='rounded-lg border px-3'>
              <SettingRow label='拦截蒸馏请求' desc='默认 403 distill_blocked'>
                <Switch
                  checked={draft.enabled}
                  onCheckedChange={(v) => patch({ enabled: v })}
                />
              </SettingRow>
            </div>
            <div className='rounded-lg border px-3'>
              <SettingRow label='官方客户端放行' desc='收割包装和正则仍拦'>
                <Switch
                  checked={draft.skip_official}
                  onCheckedChange={(v) => patch({ skip_official: v })}
                />
              </SettingRow>
            </div>
            <div className='rounded-lg border px-3'>
              <SettingRow label='0 注入放行' desc='拒答缓存仍生效'>
                <Switch
                  checked={draft.skip_zero !== false}
                  onCheckedChange={(v) => patch({ skip_zero: v })}
                />
              </SettingRow>
            </div>
            <div className='rounded-lg border px-3'>
              <SettingRow label='无工具才看结构' desc='带 tools 不当收获'>
                <Switch
                  checked={draft.structure.require_no_tools}
                  onCheckedChange={(v) =>
                    patchStructure({ require_no_tools: v })
                  }
                />
              </SettingRow>
            </div>
            <div className='rounded-lg border px-3 md:col-span-2'>
              <SettingRow label='单轮才看结构' desc='多轮对话不当收获'>
                <Switch
                  checked={draft.structure.require_single_turn}
                  onCheckedChange={(v) =>
                    patchStructure({ require_single_turn: v })
                  }
                />
              </SettingRow>
            </div>
          </div>
        </Group>

        <Group title='返回'>
          <div className='grid gap-3 sm:grid-cols-2'>
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
              <Label htmlFor='distill-min-tokens'>
                结构特征 min max_tokens
              </Label>
              <Input
                id='distill-min-tokens'
                type='number'
                min={256}
                value={draft.structure.min_max_tokens}
                onChange={(e) =>
                  patchStructure({
                    min_max_tokens: Number(e.target.value) || 8192,
                  })
                }
              />
            </div>
            <div className='space-y-1.5'>
              <Label htmlFor='distill-code'>错误 code</Label>
              <Input
                id='distill-code'
                value={draft.error.code}
                onChange={(e) => patchError({ code: e.target.value })}
              />
            </div>
            <div className='space-y-1.5'>
              <Label htmlFor='distill-type'>错误 type</Label>
              <Input
                id='distill-type'
                value={draft.error.type}
                onChange={(e) => patchError({ type: e.target.value })}
              />
            </div>
            <div className='space-y-1.5 sm:col-span-2'>
              <Label htmlFor='distill-message'>返回文案</Label>
              <Input
                id='distill-message'
                value={draft.error.message}
                onChange={(e) => patchError({ message: e.target.value })}
              />
            </div>
          </div>
        </Group>

        <Group
          title='规则'
          hint='删掉内置正则后保存会补回。不要写单独的 distill，会误伤化学题'
        >
          <Fold
            title='拦截模板'
            meta={needleCount ? `${needleCount} 条` : '还没有'}
            defaultOpen={needleCount > 0}
          >
            <p className='mb-2 text-xs text-muted-foreground'>
              一行一条。不要写「请分步解答」。
            </p>
            <Textarea
              id='distill-needles'
              className='min-h-36 font-mono text-xs'
              value={needlesText}
              onChange={(e) => setNeedlesText(e.target.value)}
            />
          </Fold>
          <Fold
            title='硬正则'
            meta={patternCount ? `${patternCount} 条` : '还没有'}
            defaultOpen={patternCount > 0}
          >
            <p className='mb-2 text-xs text-muted-foreground'>
              一行一条。官方客户端和 0 注入也拦。
            </p>
            <Textarea
              id='distill-patterns'
              className='min-h-36 font-mono text-xs'
              value={patternsText}
              onChange={(e) => setPatternsText(e.target.value)}
            />
          </Fold>
          <Fold
            title='题目指纹'
            meta={fpCount ? `${fpCount} 题` : '还没有'}
            defaultOpen={fpCount > 0}
          >
            <p className='mb-2 text-xs text-muted-foreground'>
              每题用 --- 分隔。题面包含这段就拦。
            </p>
            <Textarea
              id='distill-fingerprints'
              className='min-h-36 font-mono text-xs'
              value={fpText}
              onChange={(e) => setFpText(e.target.value)}
            />
          </Fold>
        </Group>
      </CardContent>
    </Card>
  )
}
