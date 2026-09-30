import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clearCachePrefixSessions,
  describeCacheContinuity,
  firstHistoryDiff,
  trackCachePrefix,
} from '../../src/lib/protocol/cache-prefix.mjs'

const body = (system, ...texts) => ({
  tools: [{ name: 'Read' }],
  system: [{ type: 'text', text: system }],
  messages: texts.map((text, i) => ({ role: i % 2 ? 'assistant' : 'user', content: text })),
})

test('a growing conversation keeps its prefix', () => {
  clearCachePrefixSessions()
  assert.deepEqual(trackCachePrefix('s', body('p', 'u1'), 0), { turn: 1, break: null })
  assert.deepEqual(trackCachePrefix('s', body('p', 'u1', 'a1', 'u2'), 1), { turn: 2, break: null })
})

test('moving cache markers is not a history break', () => {
  clearCachePrefixSessions()
  const first = {
    messages: [
      { role: 'user', content: [{ type: 'text', text: 'u1', cache_control: { type: 'ephemeral', ttl: '1h' } }] },
    ],
  }
  const second = {
    messages: [
      { role: 'user', content: [{ type: 'text', text: 'u1' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'a1' }] },
      { role: 'user', content: [{ type: 'text', text: 'u2', cache_control: { type: 'ephemeral', ttl: '1h' } }] },
    ],
  }
  trackCachePrefix('s', first, 0)
  assert.equal(trackCachePrefix('s', second, 1).break, null)
})

test('the first changed section is reported', () => {
  clearCachePrefixSessions()
  trackCachePrefix('s', body('p', 'u1', 'a1', 'u2'), 0)
  assert.deepEqual(trackCachePrefix('s', body('p2', 'u1', 'a1', 'u2', 'a2', 'u3'), 1).break, {
    section: 'system',
    kind: 'text',
  })
  assert.deepEqual(trackCachePrefix('s', body('p2', 'u1', 'edited', 'u2', 'a2', 'u3'), 2).break, {
    section: 'messages',
    index: 1,
    kind: 'text',
  })
  assert.deepEqual(trackCachePrefix('s', body('p2', 'u1'), 3).break, {
    section: 'messages',
    index: 1,
    kind: 'structure',
  })
})

test('an idle session past the longest TTL starts over', () => {
  clearCachePrefixSessions()
  trackCachePrefix('s', body('p', 'u1'), 0)
  assert.deepEqual(trackCachePrefix('s', body('other', 'u1'), 60 * 60_000), { turn: 1, break: null })
})

test('inbound to outbound image edits are classified without storing bytes', () => {
  const inbound = {
    messages: [
      {
        role: 'user',
        content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'aaa'.repeat(40) } }],
      },
    ],
  }
  const outbound = {
    messages: [
      {
        role: 'user',
        content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'bbb'.repeat(40) } }],
      },
    ],
  }
  assert.deepEqual(firstHistoryDiff(inbound, outbound), { section: 'messages', index: 0, kind: 'image' })
  const summary = JSON.stringify(
    describeCacheContinuity({
      inbound,
      outbound,
      layer: 'node_object',
      ttl: '1h',
      sessionId: 'sess',
      vmId: 'vm-01',
      accountId: 'acc',
      requestId: 'req',
    }),
  )
  assert.equal(summary.includes('aaa'), false)
  assert.equal(summary.includes('bbb'), false)
  const described = describeCacheContinuity({
    inbound,
    outbound,
    layer: 'node_object',
    ttl: '1h',
    sessionId: 'sess',
    vmId: 'vm-01',
    accountId: 'acc',
    requestId: 'req',
  })
  assert.equal(described.layer, 'node_object')
  assert.equal(described.wire_observed, false)
  assert.equal(described.ttl, '1h')
  assert.equal(described.session_id, 'sess')
  assert.equal(described.vm_id, 'vm-01')
  assert.equal(described.account_id, 'acc')
})
