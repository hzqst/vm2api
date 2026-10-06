import { describe, expect, it } from 'vitest'
import { proxyLabel, proxyMatchesQuery } from './proxy-sort'

const base = { id: 'px-1', host: '1.2.3.4', port: 1080 }

describe('proxyLabel', () => {
  it('puts the proxy name before the endpoint', () => {
    expect(proxyLabel({ ...base, label: '东京-2' })).toBe(
      '东京-2 · 1.2.3.4:1080'
    )
  })

  it('falls back to the bare endpoint when unnamed or blank', () => {
    expect(proxyLabel(base)).toBe('1.2.3.4:1080')
    expect(proxyLabel({ ...base, label: '   ' })).toBe('1.2.3.4:1080')
    expect(proxyLabel({ ...base, label: null })).toBe('1.2.3.4:1080')
  })
})

describe('proxyMatchesQuery', () => {
  it('finds a proxy by its name', () => {
    const prx = { ...base, label: 'Tokyo Box' }
    expect(proxyMatchesQuery(prx, 'tokyo', () => '')).toBe(true)
    expect(proxyMatchesQuery(prx, 'osaka', () => '')).toBe(false)
  })
})
