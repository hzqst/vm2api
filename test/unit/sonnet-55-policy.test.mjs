import test from 'node:test'
import assert from 'node:assert/strict'
import { toClaudeMessages } from '../../src/lib/protocol/convert.mjs'
import { prepareAnthropicRequest } from '../../src/lib/protocol/anthropic-policy.mjs'
import { prepareCliHopBody } from '../../src/lib/protocol/outbound-attempt.mjs'

const model = 'claude-sonnet-5-5'
const schema = {
  type: 'object',
  properties: { task: { type: 'string' } },
  required: ['task'],
  additionalProperties: false,
}
const tools = [
  { name: '_todo', input_schema: schema },
  { name: '_read', input_schema: schema },
]
const messages = [{ role: 'user', content: 'Plan the work.' }]

const requests = [
  ['anthropic.messages', { messages, tools, tool_choice: { type: 'tool', name: '_todo' } }],
  [
    'openai.chat',
    {
      messages,
      tools: tools.map((tool) => ({ type: 'function', function: { name: tool.name, parameters: tool.input_schema } })),
      tool_choice: { type: 'function', function: { name: '_todo' } },
    },
  ],
  [
    'openai.responses',
    {
      input: 'Plan the work.',
      tools: tools.map((tool) => ({ type: 'function', name: tool.name, parameters: tool.input_schema })),
      tool_choice: { type: 'function', name: '_todo' },
    },
  ],
]

for (const [protocol, request] of requests) {
  test(`${protocol} Sonnet 5.5 adapts named tools on both outbound paths without changing Sonnet 5`, () => {
    for (const prepare of [prepareCliHopBody, prepareAnthropicRequest]) {
      const input = { ...structuredClone(request), model, output_config: { effort: 'low' } }
      const before = structuredClone(input)
      const { claude } = toClaudeMessages(protocol, input)
      const out = prepare(claude)
      assert.deepEqual(out.tool_choice, { type: 'auto' })
      assert.equal(out.tools[0].name, '_todo')
      assert.equal(out.tools[0].strict, true)
      assert.deepEqual(out.tools[0].input_schema, schema)
      assert.equal(out.tools[1].strict, undefined)
      assert.equal(out.output_config.effort, 'low')
      assert.deepEqual(input, before)
      assert.deepEqual(prepare(out), out)
      const sonnet5 = prepare(toClaudeMessages(protocol, { ...input, model: 'claude-sonnet-5' }).claude)
      assert.deepEqual(sonnet5.tool_choice, { type: 'tool', name: '_todo' })
      assert.equal(sonnet5.tools[0].strict, undefined)
    }
  })
}

test('Sonnet 5.5 adapts required tools but preserves auto and none choices', () => {
  for (const choice of [{ type: 'any' }, 'required', { type: 'auto' }, { type: 'none' }]) {
    const out = prepareCliHopBody({ model, messages, tools, tool_choice: choice })
    assert.deepEqual(out.tool_choice, { type: choice.type === 'none' ? 'none' : 'auto' })
    assert.deepEqual(out.tools, tools)
  }
})

test('Sonnet 5.5 does not add strict to server tools or migrate Opus computer tools', () => {
  const serverTools = [
    { name: 'web_search', type: 'web_search_20250305' },
    { name: 'computer', type: 'computer_20251124' },
  ]
  const out = prepareCliHopBody({
    model,
    messages,
    tools: serverTools,
    tool_choice: { type: 'tool', name: 'web_search' },
  })
  assert.deepEqual(out.tool_choice, { type: 'auto' })
  assert.equal(out.tools[0].strict, undefined)
  assert.equal(out.tools[1].type, 'computer_20251124')
})

test('Sonnet 5.5 repaired hops still normalize rejected legacy thinking and forced tools', () => {
  for (const type of ['disabled', 'enabled', 'adaptive']) {
    const out = prepareCliHopBody(
      {
        model,
        messages,
        tools,
        thinking: { type, budget_tokens: 2048, display: 'summarized' },
        tool_choice: { type: 'tool', name: '_todo' },
      },
      { repaired: true },
    )
    assert.deepEqual(out.thinking, { type: 'adaptive', display: 'summarized' })
    assert.deepEqual(out.tool_choice, { type: 'auto' })
    assert.equal(out.tools[0].strict, true)
  }
})

test('Sonnet 5.5 schema conversion preserves effort and fills nested object constraints', () => {
  const outputSchema = {
    type: 'object',
    properties: { result: { type: 'object', properties: { ok: { type: 'boolean' } } } },
  }
  for (const protocol of ['anthropic.messages', 'openai.chat', 'openai.responses']) {
    const input = { model, messages, input: 'Return JSON.', output_config: { effort: 'low' } }
    if (protocol === 'openai.responses') input.text = { format: { type: 'json_schema', schema: outputSchema } }
    else input.response_format = { type: 'json_schema', json_schema: { schema: outputSchema } }
    const out = prepareCliHopBody(toClaudeMessages(protocol, input).claude)
    assert.equal(out.output_config.effort, 'low')
    assert.equal(out.output_config.format.type, 'json_schema')
    assert.equal(out.output_config.format.schema.additionalProperties, false)
    assert.equal(out.output_config.format.schema.properties.result.additionalProperties, false)
    assert.equal(out.output_config.format.schema.properties.result.properties.ok.type, 'boolean')
    assert.equal(outputSchema.additionalProperties, undefined)
  }
})

test('an explicit Anthropic output format wins over compatibility response_format', () => {
  const format = { type: 'json_schema', schema }
  const { claude } = toClaudeMessages('openai.chat', {
    model,
    messages,
    output_config: { effort: 'low', format },
    response_format: { type: 'json_object' },
  })
  assert.deepEqual(prepareCliHopBody(claude).output_config, { effort: 'low', format })
})
