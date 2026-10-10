import test from 'node:test'
import assert from 'node:assert/strict'
import { applyEagerToolStreaming } from '../../src/lib/protocol/eager-tool-streaming.mjs'
import { officialMessagesBody } from '../../src/lib/protocol/anthropic-messages.mjs'

const schema = { type: 'object', properties: {} }
const body = () => ({
  model: 'claude-opus-5-5',
  messages: [{ role: 'user', content: 'hi' }],
  tools: [
    { name: 'Write', description: 'w', input_schema: schema },
    { name: 'Edit', description: 'e', input_schema: schema, eager_input_streaming: false },
    { name: 'Bash', description: 'b', input_schema: schema },
    { type: 'web_search_20250305', name: 'web_search' },
  ],
})
const on = { failover: { eager_tool_streaming: true } }

test('applyEagerToolStreaming is off unless the panel enables it', () => {
  const input = body()
  assert.equal(applyEagerToolStreaming(input, {}), input)
  assert.equal(applyEagerToolStreaming(input, { failover: { eager_tool_streaming: false } }), input)
})

test('applyEagerToolStreaming marks every custom tool and keeps caller booleans', () => {
  const out = applyEagerToolStreaming(body(), on)
  const byName = Object.fromEntries(out.tools.map((tool) => [tool.name, tool]))
  assert.equal(byName.Write.eager_input_streaming, true)
  assert.equal(byName.Bash.eager_input_streaming, true)
  assert.equal(byName.Edit.eager_input_streaming, false)
  // Server tools reject unknown fields.
  assert.equal(byName.web_search.eager_input_streaming, undefined)
})

test('the eager flag survives outbound tool sanitizing', () => {
  const out = officialMessagesBody(applyEagerToolStreaming(body(), on))
  assert.equal(out.tools.find((tool) => tool.name === 'Write').eager_input_streaming, true)
})
