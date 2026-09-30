import { describe, expect, it } from 'vitest'
import {
  DEFAULT_AGENT_STANDING,
  DEFAULT_PERSONA_TEMPLATES,
  EMPTY_BLOCK_TEXT,
  PERSONA_PRESETS,
  agentStandingVar,
  overlayDisabledByPersona,
  personaInjectFromPreset,
  presetSeed,
  personaHideEnabled,
  presetFlagEnabled,
  previewSystemBlocks,
  setPersonaHide,
  setPresetFlag,
  templateSlotState,
  templateOrFollowPreset,
  validatePersonaTemplate,
} from './persona-template'

describe('persona template contract', () => {
  it('forces overlay off only for zero, and empty custom seeds official', () => {
    expect(overlayDisabledByPersona('zero')).toBe(true)
    expect(overlayDisabledByPersona('official')).toBe(false)
    expect(presetSeed(DEFAULT_PERSONA_TEMPLATES, 'custom')).toEqual(
      DEFAULT_PERSONA_TEMPLATES.official
    )
    expect(
      templateOrFollowPreset(
        DEFAULT_PERSONA_TEMPLATES.zero,
        DEFAULT_PERSONA_TEMPLATES,
        'zero'
      )
    ).toEqual([])
    expect(validatePersonaTemplate(DEFAULT_PERSONA_TEMPLATES.zero)).toEqual([])
  })

  it('writes the three persona switches back as their own inject values', () => {
    expect(personaInjectFromPreset('official', 'rewrite')).toBe(
      'official_prompt'
    )
    expect(personaInjectFromPreset('official_full', 'rewrite')).toBe(
      'official_full'
    )
    expect(personaInjectFromPreset('zero', 'rewrite')).toBe('zero')
    expect(personaInjectFromPreset('custom', 'append')).toBe('append')
  })
})

describe('agent standing + system preview', () => {
  const vars = {
    identity: 'ID',
    agent_official: 'AGENT',
    env_official: 'ENV',
    caller_agent: '',
    caller_system: '',
  }

  it('keeps standing default off while explicit true stays enabled', () => {
    for (const key of PERSONA_PRESETS) {
      expect(presetFlagEnabled({}, 'agent_standing_presets', key)).toBe(false)
      expect(agentStandingVar({}, key)).toBe('')
    }
    expect(
      agentStandingVar(
        { agent_standing_presets: { official: true } },
        'official'
      )
    ).toBe(`${DEFAULT_AGENT_STANDING}\n`)
    expect(
      agentStandingVar({ agent_standing_presets: { official: true } }, 'zero')
    ).toBe('')
    expect(
      agentStandingVar(
        { agent_standing: '', agent_standing_presets: { official: true } },
        'official'
      )
    ).toBe('')
    expect(
      agentStandingVar({ agent_standing_presets: { zero: false } }, 'zero')
    ).toBe('')
  })

  it('keeps env and standing-hide flags default on', () => {
    for (const key of PERSONA_PRESETS) {
      expect(presetFlagEnabled({}, 'persona_env_presets', key)).toBe(true)
      expect(presetFlagEnabled({}, 'agent_standing_hide_presets', key)).toBe(
        true
      )
    }
  })

  it('drops billing blocks and keeps a blank zero agent slot as zero-width', () => {
    const zero = previewSystemBlocks(DEFAULT_PERSONA_TEMPLATES.zero, {
      ...vars,
      agent_standing: '',
    })
    expect(zero.map((block) => block.id)).toEqual([
      'identity_slot',
      'agent_slot',
    ])
    expect(zero[1]?.text).toBe(EMPTY_BLOCK_TEXT)
    expect(zero[1]?.placeholder).toBe(true)

    const officialDefault = previewSystemBlocks(
      DEFAULT_PERSONA_TEMPLATES.official,
      {
        ...vars,
        agent_standing: agentStandingVar({}, 'official'),
        env: '# Environment\n - Timezone: Asia/Tokyo',
      }
    )
    expect(officialDefault.map((block) => block.text)).toEqual([
      'ID',
      '# Environment\n - Timezone: Asia/Tokyo',
    ])

    const officialEnabled = previewSystemBlocks(
      DEFAULT_PERSONA_TEMPLATES.official,
      {
        ...vars,
        agent_standing: agentStandingVar(
          { agent_standing_presets: { official: true } },
          'official'
        ),
        env: '# Environment\n - Timezone: Asia/Tokyo',
      }
    )
    expect(officialEnabled.map((block) => block.text)).toEqual([
      'ID',
      `${DEFAULT_AGENT_STANDING}\n`,
      '# Environment\n - Timezone: Asia/Tokyo',
    ])
  })

  it('reports whether a template can switch standing / env', () => {
    const full = DEFAULT_PERSONA_TEMPLATES.official_full
    expect(templateSlotState(full, 'agent_standing')).toBe('switch')
    expect(templateSlotState(full, 'env', ['env_official'])).toBe('builtin')
    expect(
      templateSlotState(DEFAULT_PERSONA_TEMPLATES.zero, 'env', ['env_official'])
    ).toBe('switch')
    expect(templateSlotState([], 'env', ['env_official'])).toBe('absent')
    expect(templateSlotState(DEFAULT_PERSONA_TEMPLATES.official, 'env')).toBe(
      'switch'
    )
  })

  it('toggle map is removed only when values match the field default', () => {
    const off = setPresetFlag({}, 'persona_env_presets', 'zero', false, {})
    expect(off.persona_env_presets).toEqual({
      official: true,
      official_full: true,
      zero: false,
      custom: true,
    })
    const back = setPresetFlag(off, 'persona_env_presets', 'zero', true, {})
    expect('persona_env_presets' in back).toBe(false)
    const serverHad = setPresetFlag(off, 'persona_env_presets', 'zero', true, {
      persona_env_presets: { zero: false },
    })
    expect(serverHad.persona_env_presets).toMatchObject({ zero: true })

    const standingOn = setPresetFlag(
      {},
      'agent_standing_presets',
      'official',
      true,
      {}
    )
    expect(standingOn.agent_standing_presets).toEqual({
      official: true,
      official_full: false,
      zero: false,
      custom: false,
    })
    expect(agentStandingVar(standingOn, 'official')).toBe(
      `${DEFAULT_AGENT_STANDING}\n`
    )
    expect(agentStandingVar(standingOn, 'zero')).toBe('')
    const standingOff = setPresetFlag(
      standingOn,
      'agent_standing_presets',
      'official',
      false,
      {}
    )
    expect('agent_standing_presets' in standingOff).toBe(false)

    const serverStanding = setPresetFlag(
      {},
      'agent_standing_presets',
      'official',
      false,
      { agent_standing_presets: { official: true } }
    )
    expect(serverStanding.agent_standing_presets).toEqual({
      official: false,
      official_full: false,
      zero: false,
      custom: false,
    })
  })

  it('whole-preset mask: map beats legacy persona_hides beats template hide', () => {
    const zero = DEFAULT_PERSONA_TEMPLATES.zero
    const official = DEFAULT_PERSONA_TEMPLATES.official
    expect(personaHideEnabled({}, 'zero', zero)).toBe(true)
    expect(personaHideEnabled({}, 'official', official)).toBe(false)
    expect(
      personaHideEnabled({ persona_hides: true }, 'official', official)
    ).toBe(true)
    expect(
      personaHideEnabled(
        { persona_hides: true, persona_hide_presets: { official: false } },
        'official',
        official
      )
    ).toBe(false)
    const off = setPersonaHide({}, 'zero', false, zero, {})
    expect(off.persona_hide_presets).toEqual({ zero: false })
    expect(
      'persona_hide_presets' in setPersonaHide(off, 'zero', true, zero, {})
    ).toBe(false)
  })
})
