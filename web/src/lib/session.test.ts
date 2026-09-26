import { afterEach, describe, expect, it, vi } from 'vitest'
import { logoutRequest } from './api'
import {
  LS_BASE,
  LS_TOKEN,
  LS_USER,
  hasSession,
  setApiBase,
  setSession,
} from './session'

function installBrowser(hostname: string) {
  const values = new Map<string, string>()
  vi.stubGlobal('location', { hostname, protocol: 'https:' })
  vi.stubGlobal('document', { cookie: '' })
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  })
  return values
}

afterEach(() => vi.unstubAllGlobals())

describe('panel session storage', () => {
  it('stores the bearer token even on same-origin deployments', () => {
    const values = installBrowser('kin.fkcodex.com')

    setSession('secret-token', 'admin')

    expect(values.get(LS_TOKEN)).toBe('secret-token')
    expect(values.get(LS_USER)).toBe('admin')
    expect(hasSession()).toBe(true)
  })

  it('stores the bearer token when apiBase is empty (HTTP IP install)', () => {
    const values = installBrowser('172.99.137.29')

    setSession('secret-token', 'admin')

    expect(values.get(LS_TOKEN)).toBe('secret-token')
    expect(hasSession()).toBe(true)
  })

  it('does not treat a leftover username as a session', () => {
    const values = installBrowser('172.99.137.29')
    values.set(LS_USER, 'admin')

    expect(hasSession()).toBe(false)
  })

  it('keeps the bearer fallback for a separate API origin', () => {
    const values = installBrowser('localhost')
    setApiBase('http://127.0.0.1:8787')

    setSession('secret-token', 'admin')

    expect(values.get(LS_BASE)).toBe('http://127.0.0.1:8787')
    expect(values.get(LS_TOKEN)).toBe('secret-token')
  })

  it('calls the server logout endpoint without a readable bearer token', async () => {
    installBrowser('kin.fkcodex.com')
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    setSession('secret-token', 'admin')

    logoutRequest()

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/panel/logout')
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      credentials: 'include',
    })
  })
})
