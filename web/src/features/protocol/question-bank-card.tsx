import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { JevInterceptConfig, PolicyQuestion } from '@/types/panel-routing'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
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
import { ConfirmDialog } from '@/components/confirm-dialog'
import { jevInterceptQueryOptions } from '@/features/protocol/queries'

function nextId(label: string, rows: PolicyQuestion[]) {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
  let id = /^[a-z]/.test(base) ? base : `q${Date.now().toString(36)}`
  const used = new Set(rows.map((row) => row.id))
  let n = 2
  while (used.has(id) || id === 'custom') {
    id = `${(base || 'q').slice(0, 28)}-${n++}`
  }
  return id.slice(0, 32)
}

export function QuestionBankCard() {
  const qc = useQueryClient()
  const q = useQuery(jevInterceptQueryOptions())
  const [rows, setRows] = useState<PolicyQuestion[] | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [summary, setSummary] = useState('')
  const [instructions, setInstructions] = useState('')

  useEffect(() => {
    if (!q.data) return
    setRows(q.data.question_bank || [])
    setEditing(null)
  }, [q.data])

  const save = useMutation({
    mutationFn: (questions: PolicyQuestion[]) =>
      api<JevInterceptConfig>('/api/panel/jev-intercept', {
        method: 'PUT',
        body: JSON.stringify({ questions }),
      }),
    onSuccess: async (data) => {
      toast.success('已保存题库')
      qc.setQueryData(jevInterceptQueryOptions().queryKey, data)
      setLabel('')
      setSummary('')
      setInstructions('')
    },
    onError: (error: Error) => toast.error(error.message),
  })

  if (q.error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>题库</CardTitle>
        </CardHeader>
        <CardContent className='text-sm text-destructive'>
          {(q.error as Error).message}
        </CardContent>
      </Card>
    )
  }
  if (!rows || !q.data) return null

  const saved = q.data.question_bank || []
  const dirty = JSON.stringify(rows) !== JSON.stringify(saved)
  const enabledCount = rows.filter((row) => row.enabled).length
  const deleting = rows.find((row) => row.id === deleteId)

  const patch = (id: string, next: Partial<PolicyQuestion>) => {
    setRows(rows.map((row) => (row.id === id ? { ...row, ...next } : row)))
  }

  const add = () => {
    const name = label.trim()
    const text = instructions.trim()
    if (!name || !text) {
      toast.error('先写名称和问句')
      return
    }
    if (rows.length >= 24) {
      toast.error('最多 24 题')
      return
    }
    setRows([
      ...rows,
      {
        id: nextId(name, rows),
        label: name,
        summary: summary.trim(),
        instructions: text,
        enabled: true,
        builtin: false,
      },
    ])
    setLabel('')
    setSummary('')
    setInstructions('')
  }

  return (
    <Card>
      <CardHeader className='border-b'>
        <CardTitle>题库</CardTitle>
        <CardDescription>
          每题都问「是否安全」，高分表示安全。启用的题目在同一次请求里一起问，任一题低于阈值就拦。当前启用{' '}
          {enabledCount} 题。
        </CardDescription>
        <CardAction>
          <div className='flex gap-2'>
            <Button
              size='sm'
              variant='outline'
              className='cursor-pointer'
              onClick={() => setRows(q.data?.builtin_questions || [])}
            >
              恢复内置
            </Button>
            <Button
              size='sm'
              className='cursor-pointer'
              disabled={!dirty || save.isPending}
              onClick={() => save.mutate(rows)}
            >
              {save.isPending ? '保存中' : '保存'}
            </Button>
          </div>
        </CardAction>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='divide-y overflow-hidden rounded-xl border'>
          {rows.length ? (
            rows.map((row) => (
              <div key={row.id} className='space-y-3 px-4 py-3'>
                <div className='flex items-start justify-between gap-3'>
                  <div className='min-w-0'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <p className='text-sm font-medium'>{row.label}</p>
                      {row.builtin ? (
                        <Badge variant='outline' className='font-normal'>
                          内置
                        </Badge>
                      ) : null}
                      <span className='font-mono text-xs text-muted-foreground'>
                        {row.id}
                      </span>
                    </div>
                    {row.summary ? (
                      <p className='text-xs text-muted-foreground'>
                        {row.summary}
                      </p>
                    ) : null}
                  </div>
                  <div className='flex shrink-0 items-center gap-2'>
                    <Switch
                      checked={row.enabled}
                      onCheckedChange={(on) => patch(row.id, { enabled: on })}
                    />
                    <Button
                      size='sm'
                      variant='ghost'
                      className='cursor-pointer'
                      onClick={() =>
                        setEditing(editing === row.id ? null : row.id)
                      }
                    >
                      {editing === row.id ? '收起' : '编辑'}
                    </Button>
                    <Button
                      size='sm'
                      variant='ghost'
                      className='cursor-pointer text-destructive'
                      onClick={() => setDeleteId(row.id)}
                    >
                      删除
                    </Button>
                  </div>
                </div>
                {editing === row.id ? (
                  <div className='grid gap-3'>
                    <div className='grid gap-3 sm:grid-cols-2'>
                      <div className='space-y-1.5'>
                        <Label htmlFor={`q-label-${row.id}`}>名称</Label>
                        <Input
                          id={`q-label-${row.id}`}
                          value={row.label}
                          onChange={(e) =>
                            patch(row.id, { label: e.target.value })
                          }
                        />
                      </div>
                      <div className='space-y-1.5'>
                        <Label htmlFor={`q-summary-${row.id}`}>说明</Label>
                        <Input
                          id={`q-summary-${row.id}`}
                          value={row.summary}
                          onChange={(e) =>
                            patch(row.id, { summary: e.target.value })
                          }
                        />
                      </div>
                    </div>
                    <div className='space-y-1.5'>
                      <Label htmlFor={`q-text-${row.id}`}>问句</Label>
                      <Textarea
                        id={`q-text-${row.id}`}
                        rows={3}
                        value={row.instructions}
                        onChange={(e) =>
                          patch(row.id, { instructions: e.target.value })
                        }
                      />
                    </div>
                  </div>
                ) : (
                  <p className='text-sm leading-6 text-muted-foreground'>
                    {row.instructions}
                  </p>
                )}
              </div>
            ))
          ) : (
            <p className='px-4 py-6 text-sm text-muted-foreground'>
              还没有题目。可以在下面新增，或恢复内置六题。
            </p>
          )}
        </div>

        <div className='space-y-3 rounded-xl border p-4'>
          <h3 className='text-sm font-medium'>新增题目</h3>
          <div className='grid gap-3 sm:grid-cols-2'>
            <div className='space-y-1.5'>
              <Label htmlFor='new-question-label'>名称</Label>
              <Input
                id='new-question-label'
                value={label}
                placeholder='例如 诈骗'
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
            <div className='space-y-1.5'>
              <Label htmlFor='new-question-summary'>说明</Label>
              <Input
                id='new-question-summary'
                value={summary}
                placeholder='一句话，列表里显示'
                onChange={(e) => setSummary(e.target.value)}
              />
            </div>
          </div>
          <div className='space-y-1.5'>
            <Label htmlFor='new-question-text'>问句</Label>
            <Textarea
              id='new-question-text'
              rows={3}
              value={instructions}
              placeholder='这段话是否可以提交给模型，并且不涉及……？高分表示安全。'
              onChange={(e) => setInstructions(e.target.value)}
            />
          </div>
          <Button
            type='button'
            variant='outline'
            className='cursor-pointer'
            onClick={add}
          >
            加入列表
          </Button>
        </div>
      </CardContent>
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null)
        }}
        title='删除这道题'
        desc={`删除后「${deleting?.label || deleteId || ''}」不再参与打分。还没点保存之前可以刷新放弃。`}
        confirmText='删除'
        cancelBtnText='取消'
        destructive
        handleConfirm={() => {
          if (!deleteId) return
          setRows(rows.filter((row) => row.id !== deleteId))
          if (editing === deleteId) setEditing(null)
          setDeleteId(null)
        }}
      />
    </Card>
  )
}
