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

  it('keeps the monitoring pages together in hub order', () => {
    const groups = navGroupsFor([
      'usage',
      'logs',
      'statistics',
      'overview',
      'vm',
    ])

    expect(groups[0].title).toBe('监控')
    expect(groups[0].items.map((item) => item.url)).toEqual([
      '/overview',
      '/statistics',
      '/logs',
      '/usage',
    ])
    expect(groups[1].items.map((item) => item.url)).toEqual(['/vm'])
  })
})
