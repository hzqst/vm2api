import test from 'node:test'
import assert from 'node:assert/strict'
import {
  OFFICIAL_SYSTEM_KINDS,
  TEST14_FEATURES,
  TEST14_OPENAI_INBOUND,
  extractCaseFeatures,
  officialSystemKinds,
  matchesTest14Features,
} from '../../src/lib/protocol/case-features.mjs'

test('OFFICIAL_SYSTEM_KINDS is the 4 official block kinds', () => {
  assert.deepEqual(OFFICIAL_SYSTEM_KINDS, ['billing', 'identity', 'agent_prompt', 'environment'])
  // frozen: cannot be mutated
  assert.throws(() => {
    OFFICIAL_SYSTEM_KINDS.push('extra')
  })
})

test('extractCaseFeatures handles empty / missing body', () => {
  assert.deepEqual(extractCaseFeatures(), {
    has_top_level_system: false,
    user_text: '',
    tool_names: [],
    tool_choice: null,
    forced_tool: false,
  })
  assert.deepEqual(extractCaseFeatures({}), {
    has_top_level_system: false,
    user_text: '',
    tool_names: [],
    tool_choice: null,
    forced_tool: false,
  })
})

test('extractCaseFeatures detects top-level string system', () => {
  const features = extractCaseFeatures({ system: 'you are helpful' })
  assert.equal(features.has_top_level_system, true)
})

test('extractCaseFeatures detects top-level array system with text blocks', () => {
  const features = extractCaseFeatures({
    system: [
      { type: 'text', text: 'billing' },
      { type: 'text', text: 'identity' },
    ],
  })
  assert.equal(features.has_top_level_system, true)
})

test('extractCaseFeatures ignores empty / whitespace-only system', () => {
  assert.equal(extractCaseFeatures({ system: '   ' }).has_top_level_system, false)
  assert.equal(extractCaseFeatures({ system: [{ type: 'text', text: '  ' }] }).has_top_level_system, false)
})

test('extractCaseFeatures extracts first user message text', () => {
  const features = extractCaseFeatures({
    messages: [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hello world' },
      { role: 'user', content: 'second' },
    ],
  })
  assert.equal(features.user_text, 'hello world')
})

test('extractCaseFeatures joins multi-block user content with newline', () => {
  const features = extractCaseFeatures({
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'line one' },
          { type: 'text', text: 'line two' },
        ],
      },
    ],
  })
  assert.equal(features.user_text, 'line one\nline two')
})

test('extractCaseFeatures extracts tool names from array', () => {
  const features = extractCaseFeatures({
    tools: [
      { type: 'function', function: { name: 'get_weather' } },
      { type: 'function', function: { name: 'get_time' } },
    ],
  })
  assert.deepEqual(features.tool_names, ['get_weather', 'get_time'])
})

test('extractCaseFeatures handles tool_choice with function wrapper', () => {
  const features = extractCaseFeatures({
    tool_choice: { type: 'function', function: { name: 'get_weather' } },
  })
  assert.deepEqual(features.tool_choice, { type: 'function', name: 'get_weather' })
  assert.equal(features.forced_tool, false)
})

test('extractCaseFeatures detects forced tool (type tool with name)', () => {
  const features = extractCaseFeatures({
    tool_choice: { type: 'tool', name: 'get_weather' },
  })
  assert.equal(features.forced_tool, true)
  assert.deepEqual(features.tool_choice, { type: 'tool', name: 'get_weather' })
})

test('officialSystemKinds returns empty for non-array', () => {
  assert.deepEqual(officialSystemKinds(null), [])
  assert.deepEqual(officialSystemKinds('string'), [])
  assert.deepEqual(officialSystemKinds(undefined), [])
})

test('officialSystemKinds classifies billing block', () => {
  const kinds = officialSystemKinds([{ text: 'x-anthropic-billing-header: acct_123' }])
  assert.deepEqual(kinds, ['billing'])
})

test('officialSystemKinds classifies identity block (SDK signature)', () => {
  const kinds = officialSystemKinds([
    { text: 'x-anthropic-billing-header: acct' },
    { text: "You are a Claude agent, built on Anthropic's Claude Agent SDK" },
  ])
  assert.deepEqual(kinds, ['billing', 'identity'])
})

test('officialSystemKinds classifies agent_prompt block', () => {
  const kinds = officialSystemKinds([
    { text: 'billing' },
    { text: 'identity' },
    { text: '# Doing tasks\n# Tone and style' },
  ])
  assert.equal(kinds[2], 'agent_prompt')
})

test('officialSystemKinds classifies environment block', () => {
  const kinds = officialSystemKinds([
    { text: 'billing' },
    { text: 'identity' },
    { text: 'agent' },
    { text: '# Environment' },
  ])
  assert.equal(kinds[3], 'environment')
})

test('officialSystemKinds labels unclassified early blocks as block_N', () => {
  const kinds = officialSystemKinds([{ text: 'unknown block' }])
  assert.equal(kinds[0], 'block_0')
})

test('matchesTest14Features returns true for features matching test14 inbound', () => {
  const features = {
    has_top_level_system: false,
    user_text: TEST14_FEATURES.inbound.user_text,
    tool_names: ['get_weather'],
    tool_choice: { type: 'tool', name: 'get_weather' },
    forced_tool: true,
  }
  assert.equal(matchesTest14Features(features), true)
})

test('matchesTest14Features returns false when system is present', () => {
  const features = {
    ...extractCaseFeatures(TEST14_OPENAI_INBOUND),
    has_top_level_system: true,
  }
  assert.equal(matchesTest14Features(features), false)
})

test('TEST14_FEATURES inbound shape matches expected', () => {
  assert.equal(TEST14_FEATURES.inbound.has_top_level_system, false)
  assert.equal(TEST14_FEATURES.inbound.forced_tool, true)
  assert.deepEqual(TEST14_FEATURES.inbound.tool_names, ['get_weather'])
})
