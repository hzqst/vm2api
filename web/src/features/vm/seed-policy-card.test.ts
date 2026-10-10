import { describe, expect, it } from 'vitest'
import {
  alignTelemetryDraft,
  matchSeedPreset,
  SEED_PRESETS,
} from './seed-policy-card'
import { telemetryEnabled } from './telemetry-policy'

describe('seed card follows the telemetry bit', () => {
  it('shows the standard preset as telemetry on', () => {
    expect(telemetryEnabled(SEED_PRESETS.standard)).toBe(true)
    expect(matchSeedPreset(SEED_PRESETS.standard)).toBe('standard')
  })

  it('drops contradictory mirrors so the switch stays on', () => {
    const draft = alignTelemetryDraft({
      telemetry_disabled: false,
      disable_nonessential_traffic: false,
      do_not_track: true,
      reject_client_settings: true,
      reject_client_metadata_identity: true,
    })
    expect(telemetryEnabled(draft)).toBe(true)
    expect(draft.disable_nonessential_traffic).toBe(true)
    expect(draft.do_not_track).toBe(false)
    expect(matchSeedPreset(draft)).toBe('standard')
  })
})
