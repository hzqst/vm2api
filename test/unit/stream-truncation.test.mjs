import test from 'node:test'
import assert from 'node:assert/strict'
import { createAnthropicStreamTracker, isRecoverableTruncation } from '../../src/lib/protocol/stream-truncation.mjs'

test('a cut tool call closes as max_tokens and a thinking block does not', () => {
  const tracker = createAnthropicStreamTracker()
  tracker.observe('data: {"type":"message_start","message":{"usage":{"output_tokens":3}}}\n\n')
  tracker.observe(
    'data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_1","name":"Write"}}\n\n',
  )
  tracker.observe(
    'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"file"}}\n\n',
  )
  const closing = tracker.closingEvents()
  assert.match(closing, /content_block_stop/)
  assert.match(closing, /"stop_reason":"max_tokens"/)
  assert.match(closing, /message_stop/)
  assert.equal(tracker.closingEvents(), null)

  const thinking = createAnthropicStreamTracker()
  thinking.observe('data: {"type":"message_start","message":{"usage":{"output_tokens":1}}}\n\n')
  thinking.observe('data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking"}}\n\n')
  assert.equal(thinking.closingEvents(), null)
})

test('a worker timeout is not closed as max_tokens', () => {
  assert.equal(isRecoverableTruncation({ ok: false }), true)
  assert.equal(
    isRecoverableTruncation({ body: { error: { code: 'worker_timeout', message: 'slot worker idle timeout' } } }),
    false,
  )
})
