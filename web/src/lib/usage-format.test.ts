import { describe, expect, it } from 'vitest'
import {
  calculateOutputRate,
  formatCurrency,
  formatDuration,
  formatTokenAmount,
  isNonBillingEndpoint,
  shouldHideOutputRate,
} from './usage-format'

describe('formatTokenAmount', () => {
  it('follows hub token.ts thresholds', () => {
    expect(formatTokenAmount(null)).toBe('-')
    expect(formatTokenAmount(undefined)).toBe('-')
    expect(formatTokenAmount(999)).toBe('999')
    expect(formatTokenAmount(1500)).toBe('1.5K')
    expect(formatTokenAmount(12_345)).toBe('12.35K')
    expect(formatTokenAmount(2_500_000)).toBe('2.5M')
  })
})

describe('formatCurrency', () => {
  it('prefixes $ with fixed digits and treats null as 0', () => {
    expect(formatCurrency(1.5)).toBe('$1.50')
    expect(formatCurrency(0.0123456, 6)).toBe('$0.012346')
    expect(formatCurrency(1234.5)).toBe('$1,234.50')
    expect(formatCurrency(null)).toBe('$0.00')
  })
})

describe('formatDuration', () => {
  it('switches to seconds at 1000ms', () => {
    expect(formatDuration(null)).toBe('-')
    expect(formatDuration(850)).toBe('850ms')
    expect(formatDuration(1234)).toBe('1.23s')
  })
})

describe('output rate', () => {
  it('measures from first token to completion', () => {
    expect(calculateOutputRate(100, 3000, 1000)).toBe(50)
    expect(calculateOutputRate(0, 3000, 1000)).toBeNull()
    expect(calculateOutputRate(100, 3000, null)).toBeNull()
    expect(calculateOutputRate(100, 1000, 1000)).toBeNull()
  })

  it('hides implausible rates from buffered streams', () => {
    const rate = calculateOutputRate(1000, 10_000, 9_950)
    expect(rate).toBe(20_000)
    expect(shouldHideOutputRate(rate, 10_000, 9_950)).toBe(true)
    expect(shouldHideOutputRate(50, 3000, 1000)).toBe(false)
  })
})

describe('isNonBillingEndpoint', () => {
  it('matches count_tokens and compact with trailing slash tolerance', () => {
    expect(isNonBillingEndpoint('/v1/messages/count_tokens/')).toBe(true)
    expect(isNonBillingEndpoint('/v1/responses/compact')).toBe(true)
    expect(isNonBillingEndpoint('/v1/messages')).toBe(false)
    expect(isNonBillingEndpoint(null)).toBe(false)
  })
})
