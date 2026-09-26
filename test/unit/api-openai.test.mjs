import test from 'node:test'
import assert from 'node:assert/strict'
import {
  claudeToOpenAIChatRequest,
  claudeToOpenAIResponsesRequest,
  openaiChatToClaudeMessage,
} from '../../src/lib/pool/api-openai.mjs'

test('claude request becomes openai responses for official hop', () => {
  const out = claudeToOpenAIResponsesRequest({
    model: 'gpt-5.6-sol',
    system: 'hi',
    max_tokens: 16,
    messages: [{ role: 'user', content: 'hello' }],
  })
  assert.equal(out.model, 'gpt-5.6-sol')
  assert.equal(out.input[0].role, 'developer')
  assert.equal(out.input[1].role, 'user')
  assert.equal(out.input[1].content[0].type, 'input_text')
  assert.equal(out.input[1].content[0].text, 'hello')
  assert.equal(out.max_output_tokens, 16)
  assert.equal(out.messages, undefined)
})

test('claude forced tool becomes responses tool_choice.name', () => {
  const out = claudeToOpenAIResponsesRequest({
    model: 'gpt-5.4',
    messages: [{ role: 'user', content: 'hi' }],
    tools: [{ name: 'get_weather', input_schema: { type: 'object', properties: {} } }],
    tool_choice: { type: 'tool', name: 'get_weather' },
  })
  assert.equal(out.tools[0].name, 'get_weather')
  assert.deepEqual(out.tool_choice, { type: 'function', name: 'get_weather' })
})

test('claude request becomes openai chat', () => {
  const out = claudeToOpenAIChatRequest({
    model: 'gpt-4o',
    system: 'hi',
    max_tokens: 16,
    messages: [{ role: 'user', content: 'hello' }],
  })
  assert.equal(out.model, 'gpt-4o')
  assert.equal(out.messages[0].role, 'system')
  assert.equal(out.messages[1].content, 'hello')
  assert.equal(out.stream, true)
})

test('openai chat becomes claude message', () => {
  const msg = openaiChatToClaudeMessage({
    id: 'chatcmpl-1',
    model: 'gpt-4o',
    choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 2, completion_tokens: 1 },
  })
  assert.equal(msg.content[0].text, 'ok')
  assert.equal(msg.stop_reason, 'end_turn')
  assert.equal(msg.usage.input_tokens, 2)
})
