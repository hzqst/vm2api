import type { VmUsageStats, VmUsageStatsDay } from '@/types/panel-vm'
import { describe, expect, it } from 'vitest'
import { shanghaiDay, summarizeUsageStats } from './vm-stats-model'

// 2026-09-29 20:00 UTC 已是上海 09-30 04:00：日界必须按 +8h 算。
const NOW = Date.parse('2026-09-29T20:00:00Z')

function day(d: string, over: Partial<VmUsageStatsDay> = {}): VmUsageStatsDay {
  return {
    day: d,
    requests: 0,
    errors: 0,
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_creation_tokens: 0,
    total_cost: 0,
    duration_ms_sum: 0,
    duration_n: 0,
    ...over,
  }
}

const stats = (history: VmUsageStatsDay[], days = 5): VmUsageStats => ({
  days,
  since: null,
  history,
  models: [],
  endpoints: [],
})

describe('summarizeUsageStats', () => {
  it('uses the Shanghai calendar day as the last bucket', () => {
    expect(shanghaiDay(NOW)).toBe('2026-09-30')
    const out = summarizeUsageStats(stats([]), NOW)
    expect(out?.points.map((p) => p.day)).toEqual([
      '2026-09-26',
      '2026-09-27',
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
    ])
  })

  it('averages over active days only, not idle ones', () => {
    const out = summarizeUsageStats(
      stats([
        day('2026-09-28', { requests: 10, total_cost: 4, input_tokens: 100 }),
        day('2026-09-30', { requests: 30, total_cost: 8, output_tokens: 300 }),
      ]),
      NOW
    )
    expect(out?.summary.activeDays).toBe(2)
    expect(out?.summary.avgDailyCost).toBe(6)
    expect(out?.summary.avgDailyRequests).toBe(20)
    expect(out?.summary.today.requests).toBe(30)
    expect(out?.summary.highestCost?.day).toBe('2026-09-30')
    expect(out?.summary.highestRequests?.day).toBe('2026-09-30')
  })

  it('weights response time by request count and reports null without timings', () => {
    const out = summarizeUsageStats(
      stats([
        day('2026-09-29', { requests: 1, duration_ms_sum: 100, duration_n: 1 }),
        day('2026-09-30', { requests: 3, duration_ms_sum: 900, duration_n: 3 }),
      ]),
      NOW
    )
    expect(out?.summary.avgMs).toBe(250)
    const none = summarizeUsageStats(
      stats([day('2026-09-30', { requests: 2 })]),
      NOW
    )
    expect(none?.summary.avgMs).toBeNull()
  })

  it('returns no highest day and zero averages for an idle slot', () => {
    const out = summarizeUsageStats(stats([]), NOW)
    expect(out?.summary.highestCost).toBeNull()
    expect(out?.summary.avgDailyRequests).toBe(0)
    expect(summarizeUsageStats(null, NOW)).toBeNull()
  })
})
