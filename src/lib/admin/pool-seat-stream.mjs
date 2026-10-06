/**
 * Panel seat stream: PoolScheduler 'change' events become throttled
 * `event: seats` frames. The web client reads it with fetch + ReadableStream
 * because EventSource cannot send the panel Bearer token.
 */

export const SEAT_STREAM_THROTTLE_MS = 250
export const SEAT_STREAM_PING_MS = 15_000

/**
 * @param {object} opts
 * @param {() => import('../pool/pool-scheduler.mjs').PoolScheduler | null} opts.getScheduler
 *   Read on every ping: initPoolRuntime() may swap the scheduler instance.
 * @param {(() => Set<string>) | null} [opts.visibleVmIds] Null = every VM (admin / super).
 */
export function servePoolSeatStream({
  req,
  res,
  getScheduler,
  writeSSEHeaders,
  visibleVmIds = null,
  throttleMs = SEAT_STREAM_THROTTLE_MS,
  pingMs = SEAT_STREAM_PING_MS,
}) {
  writeSSEHeaders(res)
  let scheduler = null
  let timer = null
  let closed = false

  const send = () => {
    timer = null
    if (closed) return
    const seats = scheduler?.seatSnapshot?.() || {}
    const visible = visibleVmIds ? visibleVmIds() : null
    const scoped = visible ? Object.fromEntries(Object.entries(seats).filter(([id]) => visible.has(id))) : seats
    res.write(`event: seats\ndata: ${JSON.stringify({ seats: scoped, ts: Date.now() })}\n\n`)
  }
  // Runs inside the scheduler's acquire/release path: only arm a timer, never throw.
  const onChange = () => {
    if (timer || closed) return
    timer = setTimeout(send, throttleMs)
  }
  const bind = () => {
    const next = getScheduler() || null
    if (next === scheduler) return false
    scheduler?.off?.('change', onChange)
    scheduler = next
    scheduler?.on?.('change', onChange)
    return true
  }

  bind()
  send()
  const ping = setInterval(() => {
    if (closed) return
    if (bind()) onChange()
    res.write(': ping\n\n')
  }, pingMs)

  const close = () => {
    if (closed) return
    closed = true
    clearTimeout(timer)
    clearInterval(ping)
    scheduler?.off?.('change', onChange)
  }
  req.on('close', close)
  res.on('close', close)
  res.on('error', close)
}
