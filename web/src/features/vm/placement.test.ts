import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api'
import { logTail, preflightChecksFromError, preflightMark } from './placement'

describe('preflightMark', () => {
  it('only error-level failures block; warn failures are advisory', () => {
    expect(preflightMark({ ok: true, level: 'error' })).toBe('ok')
    expect(preflightMark({ ok: false, level: 'error' })).toBe('fail')
    expect(preflightMark({ ok: false, level: 'warn' })).toBe('warn')
  })
})

describe('preflightChecksFromError', () => {
  it('reads error.checks from a placement_preflight_failed ApiError and drops malformed rows', () => {
    const error = new ApiError('preflight failed', 409, {
      code: 'placement_preflight_failed',
      checks: [
        { id: 'docker', ok: false, level: 'error', message: 'docker down' },
        { id: 'disk', ok: false, level: 'fatal', message: 'bad level' },
        { id: 'ssh', message: 'no ok flag' },
        null,
      ],
    })
    expect(preflightChecksFromError(error)).toEqual([
      { id: 'docker', ok: false, level: 'error', message: 'docker down' },
    ])
  })

  it('returns nothing for non-ApiError or missing checks', () => {
    expect(preflightChecksFromError(new Error('x'))).toEqual([])
    expect(preflightChecksFromError(new ApiError('x', 404))).toEqual([])
    expect(preflightChecksFromError(null)).toEqual([])
  })
})

describe('logTail', () => {
  it('keeps the last N lines ignoring trailing newlines and CRLF', () => {
    const log = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join(
      '\r\n'
    )
    const tail = logTail(`${log}\n\n`, 20).split('\n')
    expect(tail).toHaveLength(20)
    expect(tail[0]).toBe('line 11')
    expect(tail[19]).toBe('line 30')
  })

  it('is empty for missing logs', () => {
    expect(logTail(null)).toBe('')
    expect(logTail('')).toBe('')
  })
})
