import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareCliHopBody, stripCliOwnedSystem } from '../../src/lib/protocol/outbound-attempt.mjs'
import { CRS_OFFICIAL_SYSTEM, CRS_OFFICIAL_CLI_SYSTEM } from '../../src/lib/identity/crs-persona.mjs'
import { CRS_OFFICIAL_AGENT_PROMPT } from '../../src/lib/identity/official-cc-system-2.1.241.mjs'

test('prepareCliHopBody drops metadata and CLI-owned system but keeps official agent leftover', () => {
  const body = prepareCliHopBody({
    model: 'claude-sonnet-5',
    max_tokens: 256,
    metadata: { user_id: '{"device_id":"abc"}' },
    system: [
      {
        type: 'text',
        text: "x-anthropic-billing-header: cc_version=2.8.4; prompt_version=You are a Claude agent, built on Anthropic's Claude Agent SDK.;",
      },
      { type: 'text', text: CRS_OFFICIAL_SYSTEM },
      { type: 'text', text: CRS_OFFICIAL_AGENT_PROMPT },
      { type: 'text', text: '# Environment\nTime zone: America/New_York' },
    ],
    messages: [{ role: 'user', content: 'hi' }],
  })
  assert.equal(body.metadata, undefined)
  assert.equal(body.system.length, 1)
  assert.equal(body.system[0].text, CRS_OFFICIAL_AGENT_PROMPT)
  assert.equal(body.model, 'claude-sonnet-5')
  assert.deepEqual(body.messages[0].content, [{ type: 'text', text: 'hi' }])
  assert.equal(body.stream, true)
})

test('prepareCliHopBody keeps caller leftover system and tools', () => {
  const body = prepareCliHopBody({
    model: 'claude-opus-5',
    max_tokens: 1024,
    system: [
      { type: 'text', text: CRS_OFFICIAL_CLI_SYSTEM },
      { type: 'text', text: '你是一个高速收费员。' },
    ],
    tools: [{ name: 'get_weather', input_schema: { type: 'object', properties: {} } }],
    thinking: { type: 'disabled' },
    messages: [{ role: 'user', content: '你好呀。' }],
  })
  assert.equal(body.metadata, undefined)
  assert.equal(body.system.length, 1)
  assert.equal(body.system[0].text, '你是一个高速收费员。')
  assert.equal(body.tools[0].name, 'get_weather')
  assert.equal(body.thinking.type, 'disabled')
})

test('stripCliOwnedSystem leaves empty inbound system absent', () => {
  assert.equal(stripCliOwnedSystem(undefined), undefined)
  assert.equal(stripCliOwnedSystem(''), undefined)
  assert.equal(stripCliOwnedSystem([{ type: 'text', text: '' }]), undefined)
})

test('prepareCliHopBody fills 2.1.263 thinking effort and context_management', () => {
  const body = prepareCliHopBody({
    model: 'claude-sonnet-5',
    messages: [{ role: 'user', content: 'hello' }],
  })
  assert.deepEqual(body.thinking, { type: 'adaptive', display: 'omitted' })
  assert.equal(body.output_config.effort, 'high')
  assert.equal(body.context_management.edits[0].type, 'clear_thinking_20251015')
  assert.equal(body.metadata, undefined)
  assert.equal(body.system, undefined)
})

test('prepareCliHopBody does not overwrite caller thinking disabled', () => {
  const body = prepareCliHopBody({
    model: 'claude-sonnet-5',
    max_tokens: 256,
    thinking: { type: 'disabled' },
    messages: [{ role: 'user', content: 'hi' }],
  })
  assert.equal(body.thinking.type, 'disabled')
  assert.equal(body.context_management, undefined)
})

test('prepareCliHopBody strips unsigned empty dummy and short thinking history', () => {
  const body = prepareCliHopBody({
    model: 'claude-sonnet-5',
    max_tokens: 256,
    messages: [
      { role: 'user', content: 'hi' },
      {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'keep-me', signature: 'sig_real_1234567890abcdef' },
          { type: 'thinking', thinking: 'no-sig' },
          { type: 'thinking', thinking: '', signature: 'sig_empty_text_still_long_enough' },
          { type: 'thinking', thinking: 'dummy', signature: 'skip_thought_signature_validator' },
          { type: 'thinking', thinking: 'short', signature: 'abc' },
          { type: 'text', text: 'hello' },
        ],
      },
      { role: 'user', content: 'again' },
    ],
  })
  assert.deepEqual(body.thinking, { type: 'adaptive', display: 'omitted' })
  assert.equal(body.temperature, 1)
  assert.deepEqual(body.messages[1].content, [
    { type: 'thinking', thinking: 'keep-me', signature: 'sig_real_1234567890abcdef' },
    { type: 'text', text: 'hello' },
  ])
})

test('prepareCliHopBody drops an assistant turn that is only unsigned thinking', () => {
  const body = prepareCliHopBody({
    model: 'claude-opus-5.5',
    max_tokens: 64000,
    thinking: { type: 'adaptive' },
    messages: [
      { role: 'user', content: 'first' },
      {
        role: 'assistant',
        content: [{ type: 'thinking', thinking: 'draft only', signature: 'abc' }],
      },
      { role: 'user', content: 'continue' },
    ],
  })
  assert.equal(body.model, 'claude-opus-5-5')
  assert.deepEqual(
    body.messages.map((message) => message.role),
    ['user'],
  )
  assert.deepEqual(body.messages[0].content, [
    { type: 'text', text: 'first' },
    { type: 'text', text: 'continue' },
  ])
})

test('prepareCliHopBody repaired does not refill thinking after signature downgrade', () => {
  const body = prepareCliHopBody(
    {
      model: 'claude-sonnet-5',
      max_tokens: 256,
      messages: [
        { role: 'user', content: 'hi' },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'plan' },
            { type: 'text', text: 'hello' },
          ],
        },
        { role: 'user', content: 'again' },
      ],
    },
    { repaired: true },
  )
  assert.equal(body.thinking, undefined)
  assert.equal(body.context_management, undefined)
  assert.deepEqual(body.messages[1].content, [
    { type: 'text', text: 'plan' },
    { type: 'text', text: 'hello' },
  ])
})

test('prepareCliHopBody disables thinking on Haiku so wrap CLI cannot inherit adaptive', () => {
  const body = prepareCliHopBody({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    messages: [{ role: 'user', content: 'hello' }],
  })
  assert.equal(body.thinking?.type, 'disabled')
  assert.equal(body.output_config, undefined)
  assert.equal(body.context_management, undefined)
})

test('prepareCliHopBody drops caller context_management on Haiku (thinking pinned off)', () => {
  // Claude Code 的 Haiku 旁路请求会带 clear_thinking。cli-hop 把 Haiku thinking 固定为 disabled
  // 且跳过 beta 清洗，所以必须在这里删掉该字段，否则上游会杀掉 CLI。
  const body = prepareCliHopBody({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    context_management: { edits: [{ type: 'clear_thinking_20251015' }] },
    messages: [{ role: 'user', content: 'hi' }],
  })
  assert.equal(body.thinking?.type, 'disabled')
  assert.equal(body.context_management, undefined)
})

test('prepareCliHopBody disables Haiku adaptive thinking', () => {
  const body = prepareCliHopBody({
    model: 'claude-haiku-4-5',
    max_tokens: 256,
    thinking: { type: 'adaptive', display: 'omitted' },
    messages: [{ role: 'user', content: 'hello' }],
  })
  assert.equal(body.thinking.type, 'disabled')
})

test('cli-hop removes all cache markers before native CLI processing', () => {
  const body = prepareCliHopBody(
    {
      model: 'claude-sonnet-5',
      max_tokens: 256,
      tools: [{ name: 'Read', cache_control: { type: 'ephemeral', ttl: '5m' } }],
      system: [{ type: 'text', text: 'caller', cache_control: { type: 'ephemeral', ttl: '1h' } }],
      cache_control: { type: 'ephemeral', ttl: '5m' },
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'u1', cache_control: { type: 'ephemeral', ttl: '1h' } }] },
        { role: 'assistant', content: [{ type: 'text', text: 'a1', cache_control: { type: 'ephemeral' } }] },
        { role: 'user', content: [{ type: 'text', text: 'u2', cache_control: { type: 'ephemeral', ttl: '5m' } }] },
      ],
    },
    { cacheTtl: '5m' },
  )
  assert.equal(body.cache_control, undefined)
  assert.equal(body.tools[0].cache_control, undefined)
  assert.equal(body.system[0].cache_control, undefined)
  assert.ok(body.messages.every((message) => message.content.every((block) => block.cache_control == null)))
})

test('cli-hop keeps multi-turn history intact for native CLI marker placement', () => {
  const body = prepareCliHopBody({
    model: 'claude-sonnet-5',
    max_tokens: 256,
    messages: [
      { role: 'user', content: 'u1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'u2' },
      { role: 'assistant', content: 'a2' },
      { role: 'user', content: 'u3' },
    ],
  })
  assert.deepEqual(
    body.messages.map((message) => message.role),
    ['user', 'assistant', 'user', 'assistant', 'user'],
  )
  assert.ok(body.messages.every((message) => message.content.every((block) => block.cache_control == null)))
})

test('Claude Code turns stay a byte prefix of the next one, from turn 1 on', () => {
  const reminder = (text) => ({ role: 'system', content: text })
  const budget = (left) => reminder(`<total_tokens>${left} tokens left</total_tokens>`)
  // No client flag: relays strip the billing block, so this must hold for any caller.
  const turn = (messages) =>
    prepareCliHopBody({
      model: 'claude-opus-5-5',
      max_tokens: 64000,
      system: [{ type: 'text', text: 'main prompt' }],
      messages,
    })
  // Turn 1 ends with SessionStart context, later turns with a live token counter.
  const turns = [
    [{ role: 'user', content: 'u1' }, reminder('SessionStart hook context')],
    [{ role: 'assistant', content: 'a1' }, { role: 'user', content: 'u2' }, budget(14930105)],
    [{ role: 'assistant', content: 'a2' }, { role: 'user', content: 'u3' }, budget(14928642)],
  ]
  let history = []
  let previous = null
  for (const added of turns) {
    history = [...history, ...added]
    const body = turn(history)
    assert.equal(body.messages.at(-1).role, 'system')
    if (previous) {
      assert.deepEqual(body.system, previous.system)
      assert.deepEqual(body.messages.slice(0, previous.messages.length), previous.messages)
    }
    previous = body
  }
})

test('cli-hop lifts role=system turns for models that reject them', () => {
  const body = prepareCliHopBody({
    model: 'claude-haiku-4-5',
    max_tokens: 256,
    messages: [
      { role: 'user', content: 'u1' },
      { role: 'system', content: 'reminder' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'u2' },
    ],
  })
  assert.ok(body.messages.every((message) => message.role !== 'system'))
  assert.equal(body.system.at(-1).text, 'reminder')
})
test('prepareCliHopBody clamps small max_tokens to 1024 for automated probe tests', () => {
  const probe1 = prepareCliHopBody({
    model: 'claude-haiku-4-5',
    max_tokens: 1,
    messages: [{ role: 'user', content: '.' }],
  })
  assert.equal(probe1.max_tokens, 1024)

  const probe32 = prepareCliHopBody({
    model: 'claude-haiku-4-5',
    max_tokens: 32,
    messages: [{ role: 'user', content: 'ping' }],
  })
  assert.equal(probe32.max_tokens, 1024)

  const classifier64 = prepareCliHopBody({
    model: 'claude-sonnet-5',
    max_tokens: 64,
    messages: [{ role: 'user', content: '<severity>0</severity>' }],
  })
  assert.equal(classifier64.max_tokens, 1024)

  const normal = prepareCliHopBody({
    model: 'claude-haiku-4-5',
    max_tokens: 4096,
    messages: [{ role: 'user', content: 'hello' }],
  })
  assert.equal(normal.max_tokens, 4096)
})

test('cli-hop makes Opus 5.5 acceptable to Claude Code 2.1.280', () => {
  const body = prepareCliHopBody({
    model: 'claude-opus-5.5',
    thinking: { type: 'enabled', budget_tokens: 8000, display: 'summarized' },
    output_config: { effort: 'high' },
    tool_choice: { type: 'tool', name: 'get_weather' },
    tools: [
      { name: 'get_weather', input_schema: { type: 'object' } },
      { type: 'computer_20251124', name: 'computer' },
    ],
    messages: [{ role: 'user', content: 'hi' }],
  })
  assert.equal(body.model, 'claude-opus-5-5')
  assert.deepEqual(body.thinking, { type: 'adaptive', display: 'summarized' })
  assert.equal(body.thinking.budget_tokens, undefined)
  assert.equal(body.output_config.effort, 'high')
  assert.deepEqual(body.tool_choice, { type: 'auto' })
  assert.equal(body.tools.find((tool) => tool.name === 'get_weather').strict, true)
  assert.equal(body.tools.find((tool) => tool.name === 'computer').type, 'computer_toolset_20260801')

  const filled = prepareCliHopBody({
    model: 'claude-opus-5-5',
    thinking: { type: 'disabled' },
    messages: [{ role: 'user', content: 'hi' }],
  })
  assert.equal(filled.thinking.type, 'adaptive')
  assert.equal(filled.thinking.budget_tokens, undefined)
  assert.equal(filled.output_config.effort, 'medium')

  const opus5 = prepareCliHopBody({
    model: 'claude-opus-5',
    thinking: { type: 'disabled' },
    messages: [{ role: 'user', content: 'hi' }],
  })
  assert.equal(opus5.thinking.type, 'disabled')
  assert.equal(opus5.output_config.effort, 'high')
})
