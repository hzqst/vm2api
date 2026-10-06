import type { Vm } from '@/types/panel-vm'
import { describe, expect, it } from 'vitest'
import { mergeSeatSnapshot, parseSseFrames } from './use-pool-seat-stream'

describe('seat stream frames', () => {
  it('keeps a frame split across chunks until its blank line arrives', () => {
    const first = parseSseFrames('event: seats\ndata: {"seats":')
    expect(first.frames).toEqual([])
    const second = parseSseFrames(`${first.rest}{},"ts":1}\n\n: ping\n\n`)
    expect(second.frames).toEqual([
      { event: 'seats', data: '{"seats":{},"ts":1}' },
    ])
    expect(second.rest).toBe('')
  })

  it('treats CRLF line endings like LF', () => {
    const { frames } = parseSseFrames('event: seats\r\ndata: {}\r\n\r\n')
    expect(frames).toEqual([{ event: 'seats', data: '{}' }])
  })
})

describe('seat snapshot merge', () => {
  const claude = {
    id: 'vm-1',
    seats_max: 2,
    seats_used: 2,
    queue_depth: 3,
  } as Vm
  const codex = { id: 'vm-2', seats_max: null, seats_used: null } as Vm

  it('zeroes Claude rows absent from the snapshot and leaves Codex rows alone', () => {
    const [nextClaude, nextCodex] = mergeSeatSnapshot([claude, codex], {
      seats: {},
      ts: 1,
    })
    expect(nextClaude.seats_used).toBe(0)
    expect(nextClaude.queue_depth).toBe(0)
    expect(nextCodex).toBe(codex)
  })

  it('applies live seat and queue counts', () => {
    const [next] = mergeSeatSnapshot([claude], {
      seats: { 'vm-1': { seats_used: 1, holds: 4, queue_depth: 0 } },
      ts: 1,
    })
    expect(next.seats_used).toBe(1)
    expect(next.queue_depth).toBe(0)
  })
})
