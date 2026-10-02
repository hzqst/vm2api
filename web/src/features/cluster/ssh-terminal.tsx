import { useEffect, useRef, useState } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { api } from '@/lib/api'
import { apiBase } from '@/lib/session'
import { Button } from '@/components/ui/button'

type Phase = 'connecting' | 'open' | 'closed'

/**
 * xterm ↔ WebSocket ↔ SSH shell channel. Browsers cannot send Authorization on
 * a WebSocket, so each attach first trades the panel session for a 30s
 * single-use ticket.
 */
export function SshTerminal({ nodeId }: { nodeId: string }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<Phase>('connecting')
  const [note, setNote] = useState('')
  const [session, setSession] = useState(0)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
      scrollback: 5000,
      theme: { background: '#0b0d10' },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)
    fit.fit()
    setPhase('connecting')
    setNote('')

    let ws: WebSocket | null = null
    let disposed = false
    const send = (msg: unknown) => {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
    }
    const onData = term.onData((d) => send({ t: 'd', d }))
    const onResize = term.onResize(({ cols, rows }) =>
      send({ t: 'r', c: cols, r: rows })
    )
    const observer = new ResizeObserver(() => fit.fit())
    observer.observe(host)

    api<{ ticket: string }>(`/api/panel/cluster/nodes/${nodeId}/shell-ticket`, {
      method: 'POST',
    })
      .then(({ ticket }) => {
        if (disposed) return
        const base = new URL(apiBase() || window.location.origin)
        base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:'
        base.pathname = `/api/panel/cluster/nodes/${nodeId}/shell`
        base.search = new URLSearchParams({
          ticket,
          cols: String(term.cols),
          rows: String(term.rows),
        }).toString()
        ws = new WebSocket(base.toString())
        ws.binaryType = 'arraybuffer'
        ws.onopen = () => {
          setPhase('open')
          term.focus()
        }
        ws.onmessage = (e) => {
          if (typeof e.data !== 'string') {
            term.write(new Uint8Array(e.data as ArrayBuffer))
            return
          }
          const msg = JSON.parse(e.data) as {
            t: string
            code?: number
            message?: string
          }
          if (msg.t === 'exit') setNote(`会话退出（code ${msg.code ?? '—'}）`)
          if (msg.t === 'error') setNote(msg.message || '终端错误')
        }
        ws.onclose = () => {
          if (!disposed) setPhase('closed')
        }
      })
      .catch((err: Error) => {
        if (disposed) return
        setNote(err.message)
        setPhase('closed')
      })

    return () => {
      disposed = true
      observer.disconnect()
      onData.dispose()
      onResize.dispose()
      ws?.close()
      term.dispose()
    }
  }, [nodeId, session])

  return (
    <div className='flex h-full min-h-0 flex-col gap-2'>
      <div className='flex items-center justify-between text-xs text-muted-foreground'>
        <span>
          {phase === 'connecting'
            ? '连接中…'
            : phase === 'open'
              ? '已连接'
              : `已断开${note ? ` · ${note}` : ''}`}
        </span>
        {phase === 'closed' ? (
          <Button
            size='sm'
            variant='outline'
            className='h-7'
            onClick={() => setSession((n) => n + 1)}
          >
            重新打开
          </Button>
        ) : null}
      </div>
      <div
        ref={hostRef}
        className='min-h-0 flex-1 overflow-hidden rounded-md border bg-[#0b0d10] p-1'
      />
    </div>
  )
}
