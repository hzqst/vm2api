import { describe, expect, it } from 'vitest'
import {
  telemetryEnabled,
  telemetrySeedFlags,
  telemetryView,
} from './telemetry-policy'
import { telemetryStatusLabel } from './telemetry-status'

describe('telemetry reads one bit', () => {
  it('is on only when telemetry_disabled is false', () => {
    expect(telemetryEnabled({ telemetry_disabled: false })).toBe(true)
    expect(telemetryEnabled({ telemetry_disabled: true })).toBe(false)
    expect(telemetryEnabled({})).toBe(false)
    expect(telemetryEnabled(undefined)).toBe(false)
    expect(telemetryEnabled({ telemetry_disabled: 'false' })).toBe(false)
  })

  it('derives the other flags from that bit', () => {
    expect(telemetrySeedFlags(true)).toEqual({
      telemetry_disabled: false,
      disable_nonessential_traffic: true,
      do_not_track: false,
    })
    expect(telemetrySeedFlags(false)).toEqual({
      telemetry_disabled: true,
      disable_nonessential_traffic: false,
      do_not_track: true,
    })
  })

  it('shows the default-on seed as on even when worker.json says disabled', () => {
    const view = telemetryView(
      { telemetry_disabled: false, disable_nonessential_traffic: false },
      { enabled: false, running: false }
    )
    expect(view).toMatchObject({ enabled: true, running: false })
    expect(telemetryStatusLabel(view)).toBe('已开启 · 进程未运行')
  })

  it('does not let a running process override a seed that is off', () => {
    const view = telemetryView(
      { telemetry_disabled: true },
      { enabled: true, running: true }
    )
    expect(telemetryStatusLabel(view)).toBe('未启用')
  })

  it('leaves a missing seed as a process observation', () => {
    expect(
      telemetryStatusLabel(
        telemetryView(null, { enabled: true, running: true })
      )
    ).toBe('运行中')
    expect(telemetryStatusLabel(telemetryView(undefined, undefined))).toBe(
      '状态未知'
    )
  })
})
