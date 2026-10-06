import { createElement } from 'react'
import type { Vm } from '@/types/panel-vm'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { latestProbe, probeOutcome, probeSourceLabel } from './probe-status'

describe('probe card uses persisted checks without claiming a fresh upstream probe', () => {
  it('shows a passive check when the authoritative usage probe is absent', () => {
    const check = {
      at: '2026-09-24T01:00:00Z',
      ok: true,
      source: 'messages-headers',
    }
    expect(latestProbe(check, null).at).toBe(check.at)
    expect(probeSourceLabel(check.source)).toBe('请求响应头（缓存）')
    expect(probeOutcome(check)).toBe('已读取缓存')
  })
  it('uses a newer official probe and retains legacy fallback', () => {
    const older = { at: '2026-09-23T01:00:00Z', ok: true }
    const newer = { at: '2026-09-24T01:00:00Z', ok: true }
    expect(latestProbe(older, newer)).toBe(newer)
    expect(latestProbe(null, newer)).toBe(newer)
    expect(latestProbe()).toEqual({})
  })
  it('shows unavailable and failure responses rather than generic success', () => {
    expect(probeOutcome({ ok: false, error: '暂无请求响应头用量' })).toBe(
      '暂无请求响应头用量'
    )
    expect(probeOutcome({ ok: false })).toBe('探测失败')
    expect(probeOutcome({ ok: true })).toBe('探测成功')
  })
  it.each([
    [{ code: 'worker_timeout' }, 'worker_timeout'],
    [{ message: '探测超时', code: 'worker_timeout' }, '探测超时'],
    [{ message: '', code: 'worker_timeout' }, 'worker_timeout'],
    [{ message: { code: 'nested' }, code: 'worker_timeout' }, 'worker_timeout'],
    [{ type: 'transport_error' }, 'transport_error'],
    [null, '探测失败'],
    ['', '探测失败'],
    ['   ', '探测失败'],
    [{}, '探测失败'],
    [{ message: {}, code: {} }, '探测失败'],
    [[{ code: 'worker_timeout' }], '探测失败'],
    [502, '探测失败'],
    [true, '探测失败'],
  ])('renders a safe outcome for persisted error %j', (error, expected) => {
    const outcome = probeOutcome({ ok: false, error })
    expect(outcome).toBe(expected)
    expect(renderToStaticMarkup(createElement('span', null, outcome))).toBe(
      `<span>${expected}</span>`
    )
  })
  it('renders object errors from both current checks and legacy probes', () => {
    const vm: Pick<Vm, 'last_probe' | 'last_probe_check'> = {
      last_probe: {
        at: '2026-09-23T01:00:00Z',
        ok: false,
        error: { code: 'worker_timeout' },
      },
      last_probe_check: {
        at: '2026-09-24T01:00:00Z',
        ok: false,
        error: { message: '探测超时', code: 'worker_timeout' },
      },
    }
    expect(probeOutcome(latestProbe(vm.last_probe_check, vm.last_probe))).toBe(
      '探测超时'
    )
    expect(probeOutcome(latestProbe(undefined, vm.last_probe))).toBe(
      'worker_timeout'
    )
  })
})
