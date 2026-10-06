import { describe, expect, it } from 'vitest'
import { navGroupsFor } from './sidebar-data'

describe('sidebar permissions', () => {
  it('does not treat an explicit empty view list as unrestricted', () => {
    expect(navGroupsFor([])).toEqual([])
  })

  it('shows only routes named by the panel capability list', () => {
    const groups = navGroupsFor(['overview', 'logs'])
    const urls = groups.flatMap((group) => group.items.map((item) => item.url))

    expect(urls).toEqual(['/overview', '/logs'])
  })

  it('shows statistics next to usage, ahead of logs', () => {
    const groups = navGroupsFor(['usage', 'statistics', 'logs'])
    const items = groups.flatMap((group) => group.items)

    expect(items.map((item) => item.url)).toEqual([
      '/usage',
      '/statistics',
      '/logs',
    ])
    expect(items[1].title).toBe('统计')
  })
})
