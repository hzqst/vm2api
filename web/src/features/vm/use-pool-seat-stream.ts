import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { PoolSeatSnapshot, Vm } from '@/types/panel-vm'
import { panelFetch } from '@/lib/api'
import { hasSession } from '@/lib/session'
import { vmsListQueryOptions } from '@/features/vm/queries'

const RETRY_MS = 5000

type SseFrame = { event: string; data: string }

/** 解析 `text/event-stream` 缓冲区；返回完整帧与未结束的尾部。 */
export function parseSseFrames(buffer: string): {
  frames: SseFrame[]
  rest: string
} {
  const blocks = buffer.replace(/\r\n/g, '\n').split('\n\n')
  const rest = blocks.pop() ?? ''
  const frames: SseFrame[] = []
  for (const block of blocks) {
    let event = 'message'
    const data: string[] = []
    for (const line of block.split('\n')) {
      if (!line || line.startsWith(':')) continue
      const colon = line.indexOf(':')
      const field = colon < 0 ? line : line.slice(0, colon)
      const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '')
      if (field === 'event') event = value
      else if (field === 'data') data.push(value)
    }
    if (data.length) frames.push({ event, data: data.join('\n') })
  }
  return { frames, rest }
}

/** 席位快照只覆盖 Claude 行（`seats_max` 非空）的实时字段；缺席即空闲。 */
export function mergeSeatSnapshot(items: Vm[], snap: PoolSeatSnapshot): Vm[] {
  return items.map((vm) => {
    if (vm.seats_max == null) return vm
    const live = snap.seats[vm.id]
    const seatsUsed = live?.seats_used ?? 0
    const queueDepth = live?.queue_depth ?? 0
    if (vm.seats_used === seatsUsed && vm.queue_depth === queueDepth) return vm
    return { ...vm, seats_used: seatsUsed, queue_depth: queueDepth }
  })
}

/**
 * 订阅 `/api/panel/pool/stream`，把席位/排队快照写进 VM 列表缓存。
 * EventSource 不能带 Bearer，所以用 fetch 读流；断线期间列表照常靠轮询刷新。
 */
export function usePoolSeatStream() {
  const qc = useQueryClient()
  useEffect(() => {
    const queryKey = vmsListQueryOptions().queryKey
    const ctrl = new AbortController()
    let retry: number | undefined

    const apply = (snap: PoolSeatSnapshot) => {
      qc.setQueryData(queryKey, (prev) =>
        prev ? { ...prev, items: mergeSeatSnapshot(prev.items, snap) } : prev
      )
    }

    const connect = async () => {
      if (!hasSession()) return
      let fatal = false
      try {
        const res = await panelFetch('/api/panel/pool/stream', {
          signal: ctrl.signal,
          headers: { Accept: 'text/event-stream' },
        })
        // 鉴权失败不重连：等下次挂载（重新登录后）再订阅。
        if (res.status === 401 || res.status === 403) fatal = true
        if (!res.ok || !res.body) return
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
        let buffer = ''
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          const parsed = parseSseFrames(buffer + value)
          buffer = parsed.rest
          for (const frame of parsed.frames) {
            if (frame.event !== 'seats') continue
            try {
              apply(JSON.parse(frame.data) as PoolSeatSnapshot)
            } catch {
              // 单帧损坏只丢这一帧，下一次变化会再推完整快照。
            }
          }
        }
      } catch {
        // 网络中断或 abort：abort 由 finally 判定，不重连。
      } finally {
        if (!ctrl.signal.aborted && !fatal) {
          retry = window.setTimeout(() => void connect(), RETRY_MS)
        }
      }
    }

    void connect()
    return () => {
      ctrl.abort()
      clearTimeout(retry)
    }
  }, [qc])
}
