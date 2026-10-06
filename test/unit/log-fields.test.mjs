import test from 'node:test'
import assert from 'node:assert/strict'
import { reasoningEffortOf, sessionIdForLog } from '../../src/lib/protocol/log-fields.mjs'

test('reasoningEffortOf reads each inbound dialect', () => {
  assert.equal(reasoningEffortOf({ output_config: { effort: 'High' } }), 'high')
  assert.equal(reasoningEffortOf({ reasoning_effort: ' minimal ' }), 'minimal')
  assert.equal(reasoningEffortOf({ reasoning: { effort: 'XHIGH' } }), 'xhigh')
})

test('reasoningEffortOf prefers the Anthropic field and rejects unknown values', () => {
  assert.equal(reasoningEffortOf({ output_config: { effort: 'max' }, reasoning_effort: 'low' }), 'max')
  assert.equal(reasoningEffortOf({ reasoning_effort: 'turbo' }), null)
  assert.equal(reasoningEffortOf({ reasoning: { effort: 3 } }), null)
  assert.equal(reasoningEffortOf({ thinking: { type: 'enabled', budget_tokens: 2048 } }), null)
  assert.equal(reasoningEffortOf(null), null)
})

test('sessionIdForLog trims, caps at 200 chars, and maps empty to null', () => {
  assert.equal(sessionIdForLog('  abc  '), 'abc')
  assert.equal(sessionIdForLog('x'.repeat(300)).length, 200)
  assert.equal(sessionIdForLog(''), null)
  assert.equal(sessionIdForLog(undefined), null)
})
