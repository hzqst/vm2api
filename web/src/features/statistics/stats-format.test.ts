import { describe, expect, it } from 'vitest'
import {
  SERIES_PALETTE,
  formatBucketTick,
  formatBucketTitle,
  percentChange,
  seriesColor,
  sessionDisplay,
} from './stats-format'

describe('seriesColor', () => {
  it('wraps around the 10-colour palette', () => {
    expect(SERIES_PALETTE).toHaveLength(10)
    expect(seriesColor(0)).toBe('var(--chart-1)')
    expect(seriesColor(10)).toBe(seriesColor(0))
    expect(seriesColor(13)).toBe(SERIES_PALETTE[3])
  })

  it('never yields undefined for a missing (-1) index', () => {
    expect(seriesColor(-1)).toBe(SERIES_PALETTE[9])
  })
})

describe('formatBucketTick', () => {
  const iso = '2026-10-03T16:00:00.000Z'

  it('formats hour buckets as HH:mm in the target zone', () => {
    expect(formatBucketTick(iso, 'hour', 'Asia/Shanghai')).toBe('00:00')
    expect(formatBucketTick(iso, 'hour', 'UTC')).toBe('16:00')
  })

  it('formats day buckets as M/d, rolling the date across the zone boundary', () => {
    expect(formatBucketTick(iso, 'day', 'Asia/Shanghai')).toBe('10/4')
    expect(formatBucketTick(iso, 'day', 'America/Los_Angeles')).toBe('10/3')
  })

  it('returns an empty label for unparsable input', () => {
    expect(formatBucketTick('', 'hour', 'UTC')).toBe('')
    expect(formatBucketTick('nope', 'day', 'UTC')).toBe('')
  })
})

describe('formatBucketTitle', () => {
  it('uses zh-CN month names like date-fns MMMM', () => {
    const iso = '2026-12-31T23:30:00.000Z'
    expect(formatBucketTitle(iso, 'hour', 'UTC')).toBe('十二月 31 23:30')
    expect(formatBucketTitle(iso, 'day', 'Asia/Shanghai')).toBe('2027 一月 1')
  })
})

describe('percentChange', () => {
  it('rounds the relative change to an integer percent', () => {
    expect(percentChange(150, 100)).toBe(50)
    expect(percentChange(1, 3)).toBe(-67)
  })

  it('treats a zero baseline as +100 when there is new volume, else 0', () => {
    expect(percentChange(5, 0)).toBe(100)
    expect(percentChange(0, 0)).toBe(0)
  })

  it('returns null when either side is unknown', () => {
    expect(percentChange(null, 10)).toBeNull()
    expect(percentChange(10, undefined)).toBeNull()
    expect(percentChange(Number.NaN, 10)).toBeNull()
  })
})

describe('sessionDisplay', () => {
  const now = Date.parse('2026-10-04T00:10:00.000Z')

  it('flags a failed last request even when it is recent', () => {
    const s = { lastStatus: 529, lastAt: '2026-10-04T00:09:59.000Z' }
    expect(sessionDisplay(s, now).label).toBe('FAIL')
  })

  it('is LIVE only within one minute of the last completion', () => {
    expect(
      sessionDisplay(
        { lastStatus: 200, lastAt: '2026-10-04T00:09:00.000Z' },
        now
      ).label
    ).toBe('LIVE')
    expect(
      sessionDisplay(
        { lastStatus: null, lastAt: '2026-10-04T00:08:59.000Z' },
        now
      ).label
    ).toBe('IDLE')
  })

  it('falls back to IDLE for an unparsable timestamp', () => {
    expect(sessionDisplay({ lastStatus: 200, lastAt: '' }, now).label).toBe(
      'IDLE'
    )
  })
})
