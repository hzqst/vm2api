import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { TestModelsPayload, Vm } from '@/types/panel-vm'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { isCodexVm } from '@/lib/vm-kind'
import { testModelsQueryOptions } from '@/features/vm/queries'
import type { TestChatResult } from '@/features/vm/test-chat-types'

/** 详情页测试 Tab 与列表弹窗共用：模型列表、参数、发送与结果。 */
export function useVmTestChat(vm: Vm) {
  const id = vm.id
  const qc = useQueryClient()
  const testModels = useQuery(testModelsQueryOptions(id))
  const [prompt, setPrompt] = useState('hello')
  const [model, setModel] = useState('')
  const [maxTokens, setMaxTokens] = useState(8192)
  const [reasoningEffort, setReasoningEffort] = useState('medium')
  const [result, setResult] = useState<TestChatResult | null>(null)
  const models = useMemo(
    () => testModels.data?.items || testModels.data?.models || [],
    [testModels.data]
  )

  useEffect(() => {
    if (!models.length) return
    if (!model || !models.some((item) => item.id === model)) {
      setModel(models[0].id)
    }
  }, [models, model])

  const send = useMutation({
    mutationFn: () =>
      api<TestChatResult>(
        `/api/panel/vms/${encodeURIComponent(id)}/test-chat`,
        {
          method: 'POST',
          body: JSON.stringify({
            model: model || models[0]?.id,
            prompt,
            ...(isCodexVm(vm)
              ? { reasoning_effort: reasoningEffort }
              : { max_tokens: maxTokens }),
          }),
        }
      ),
    onSuccess: (data) => {
      setResult(data)
      // 外层 envelope 的 ok 恒为 true（业务成败在剥壳后的 data.ok），
      // 所以失败也会走到这里 —— 不能只 toast.success。
      if (data?.ok) {
        toast.success(`测试成功 · ${data.duration_ms ?? 0}ms`)
      } else {
        toast.error(`测试失败：${data?.error?.message || '未知错误'}`)
      }
    },
    onError: (error: Error) => {
      setResult({
        ok: false,
        duration_ms: 0,
        log: [],
        error: { message: error.message },
      })
      toast.error(error.message)
    },
  })

  return {
    models,
    model,
    prompt,
    maxTokens,
    reasoningEffort,
    result,
    running: send.isPending,
    modelsRefreshing: testModels.isFetching,
    onModelChange: setModel,
    onPromptChange: setPrompt,
    onMaxTokensChange: setMaxTokens,
    onReasoningEffortChange: setReasoningEffort,
    onTest: () => {
      setResult(null)
      send.mutate()
    },
    onRefreshModels: () => {
      void (async () => {
        try {
          const data = await api<TestModelsPayload>(
            `/api/panel/test-models?vm_id=${encodeURIComponent(id)}&refresh=1`
          )
          qc.setQueryData(testModelsQueryOptions(id).queryKey, data)
        } catch (error) {
          toast.error((error as Error).message || '刷新模型失败')
        }
      })()
    },
  }
}
