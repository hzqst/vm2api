import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  callGoWorker,
  finalizeWorkerPayload,
  streamGoWorker,
  workerHealth,
  usageFromSseEvent,
  isDownstreamCommitEvent,
  restoreUncommittedHop,
} from '../../src/lib/transport/go-worker-client.mjs'
import { extractOpenaiUsage } from '../../src/lib/protocol/openai-usage.mjs'

test('restoreUncommittedHop keeps a structured upstream code', () => {
  const restored = restoreUncommittedHop({
    ok: false,
    status: 200,
    committed: false,
    terminalState: 'incomplete',
    body: {
      type: 'error',
      error: { type: 'api_error', code: 'upstream_stream_incomplete', message: 'job idle timeout' },
    },
  })
  assert.equal(restored.body.error.code, 'upstream_stream_incomplete')
  assert.notEqual(restored.body.error.code, 'empty_response')
})

test('setup-token worker envelope is inference-only', () => {
  const out = finalizeWorkerPayload({
    body: { model: 'claude-sonnet-5', messages: [{ role: 'user', content: 'hi' }] },
    reqHeaders: { 'user-agent': 'kin-console-test/1.0' },
    exec: { homeDir: '', vm: { claude: { mode: 'setup-token', scope: 'user:inference' } } },
    identity: null,
  })
  assert.equal(out.headers['user-agent'], 'kin-inference/1.0')
  assert.doesNotMatch(String(out.headers['anthropic-beta'] || ''), /claude-code-20250219/)
  assert.match(String(out.headers['anthropic-beta'] || ''), /oauth-2025-04-20/)
})

test('cli-hop envelope keeps role=system turns that the VM betas do not declare', () => {
  const body = {
    model: 'claude-opus-5-5',
    system: [{ type: 'text', text: 'main prompt' }],
    messages: [
      { role: 'user', content: 'u1' },
      { role: 'system', content: 'reminder' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'u2' },
    ],
  }
  const out = finalizeWorkerPayload({
    body,
    reqHeaders: {},
    // setup-token betas omit mid-conversation-system; cli-node sends it on the wire.
    exec: { homeDir: '', vm: { claude: { mode: 'setup-token', scope: 'user:inference' } } },
    identity: null,
    cliHop: true,
  })
  assert.doesNotMatch(String(out.headers['anthropic-beta'] || ''), /mid-conversation-system/)
  assert.deepEqual(
    out.body.messages.map((message) => message.role),
    ['user', 'system', 'assistant', 'user'],
  )
  assert.deepEqual(out.body.system, body.system)
})

const unix = process.platform !== 'win32'
const unixTest = unix ? test : test.skip

async function fixture(handler) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kin-go-client-'))
  const slot = path.join(root, 'vm-01')
  const runDir = path.join(slot, 'run')
  const homeDir = path.join(slot, 'cli-home')
  fs.mkdirSync(runDir, { recursive: true })
  fs.mkdirSync(homeDir, { recursive: true })
  fs.writeFileSync(path.join(runDir, 'internal.token'), 'internal-test\n', { mode: 0o600 })
  const socket = path.join(runDir, 'worker.sock')
  const server = http.createServer(handler)
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(socket, resolve)
  })
  return {
    exec: {
      vmId: 'vm-01',
      homeDir,
      vm: {
        runtime: {
          worker_socket: socket,
          worker_run_dir: runDir,
          worker_token_file: path.join(runDir, 'internal.token'),
        },
      },
    },
    async close() {
      await new Promise((resolve) => server.close(resolve))
      fs.rmSync(root, { recursive: true, force: true })
    },
  }
}

unixTest('callGoWorker sends envelope over authenticated Unix socket', async () => {
  const fx = await fixture(async (req, res) => {
    assert.equal(req.headers['x-kin-internal-token'], 'internal-test')
    assert.equal(req.url, '/internal/v1/messages')
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const envelope = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    assert.equal(envelope.body.model, 'claude-test')
    assert.equal(envelope.cache_ttl, '1h')
    assert.equal(envelope.preserve_cache_breakpoints, false)
    assert.equal(envelope.stream, false)
    assert.match(envelope.headers['user-agent'], /^claude-cli\//)
    res.setHeader('content-type', 'application/json')
    res.setHeader('x-kin-terminal-state', 'verified')
    res.end(
      JSON.stringify({
        type: 'message',
        id: 'msg_test',
        role: 'assistant',
        content: [{ type: 'text', text: 'ok' }],
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    )
  })
  try {
    const result = await callGoWorker({
      exec: fx.exec,
      body: { model: 'claude-test', messages: [{ role: 'user', content: 'hi' }] },
      cacheTtl: '1h',
      reqHeaders: { 'user-agent': 'test-client' },
    })
    assert.equal(result.ok, true)
    assert.equal(result.terminalState, 'verified')
    assert.equal(result.body.content[0].text, 'ok')
  } finally {
    await fx.close()
  }
})

unixTest('callGoWorker marks null TTL as client-owned cache breakpoints', async () => {
  const fx = await fixture(async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const envelope = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    assert.equal(envelope.cache_ttl, null)
    assert.equal(envelope.preserve_cache_breakpoints, true)
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ type: 'message', role: 'assistant', content: [{ type: 'text', text: 'ok' }] }))
  })
  try {
    const result = await callGoWorker({
      exec: fx.exec,
      body: { model: 'claude-test', messages: [{ role: 'user', content: 'hi' }] },
      cacheTtl: null,
    })
    assert.equal(result.ok, true)
  } finally {
    await fx.close()
  }
})

unixTest('streamGoWorker accepts message_stop before delayed EOF', async () => {
  const fx = await fixture((req, res) => {
    res.setHeader('content-type', 'text/event-stream')
    res.setHeader('trailer', 'x-kin-terminal-state')
    res.write('event: message_start\ndata: {"type":"message_start","message":{}}\n\n')
    res.write('event: message_stop\ndata: {"type":"message_stop"}\n\n')
    res.addTrailers({ 'x-kin-terminal-state': 'verified' })
    setTimeout(() => res.end(), 50)
  })
  try {
    const lines = []
    const result = await streamGoWorker({
      exec: fx.exec,
      body: { model: 'claude-test', stream: true, messages: [{ role: 'user', content: 'hi' }] },
      onEvent: (line) => lines.push(line),
    })
    assert.equal(result.ok, true)
    assert.equal(result.terminalState, 'verified')
    assert.equal(result.committed, true)
    assert.ok(lines.some((line) => line.includes('message_stop')))
  } finally {
    await fx.close()
  }
})

unixTest('streamGoWorker accepts message_stop with usage trailers', async () => {
  const fx = await fixture((req, res) => {
    assert.equal(req.headers.te, 'trailers')
    res.setHeader('content-type', 'text/event-stream')
    res.setHeader('trailer', 'x-kin-terminal-state, x-kin-usage, x-kin-model, x-kin-stop-reason')
    res.write('data: {"type":"message_start","message":{"model":"claude-haiku-4-5-20251001"}}\n\n')
    res.write('data: {"type":"message_stop"}\n\n')
    res.addTrailers({
      'x-kin-terminal-state': 'verified',
      'x-kin-usage': JSON.stringify({ input_tokens: 12, output_tokens: 0 }),
      'x-kin-model': 'claude-haiku-4-5-20251001',
      'x-kin-stop-reason': 'end_turn',
    })
    res.end()
  })
  try {
    const result = await streamGoWorker({
      exec: fx.exec,
      body: { model: 'claude-haiku-4-5-20251001', stream: true, messages: [{ role: 'user', content: 'hi' }] },
      onEvent: () => {},
    })
    assert.equal(result.ok, true)
    assert.equal(result.terminalState, 'verified')
    assert.equal(result.usage.input_tokens, 12)
    assert.equal(result.model, 'claude-haiku-4-5-20251001')
    assert.equal(result.stopReason, 'end_turn')
    assert.ok(result.ttftMs != null && result.ttftMs >= 0)
  } finally {
    await fx.close()
  }
})

unixTest('streamGoWorker keeps rate-limit trailers after message_stop', async () => {
  const fx = await fixture((req, res) => {
    res.setHeader('content-type', 'text/event-stream')
    res.setHeader('trailer', 'x-kin-terminal-state, x-kin-rate-limit-headers')
    res.write('data: {"type":"message_start","message":{}}\n\n')
    res.write('data: {"type":"message_stop"}\n\n')
    res.addTrailers({
      'x-kin-terminal-state': 'verified',
      'x-kin-rate-limit-headers': JSON.stringify({
        'anthropic-ratelimit-unified-5h-utilization': '0.81',
        'set-cookie': 'nope',
      }),
    })
    res.end()
  })
  try {
    const result = await streamGoWorker({
      exec: fx.exec,
      body: { model: 'claude-sonnet-5', stream: true, messages: [{ role: 'user', content: 'hi' }] },
      onEvent: () => {},
    })
    assert.equal(result.ok, true)
    assert.equal(result.terminalState, 'verified')
    assert.equal(result.headers['anthropic-ratelimit-unified-5h-utilization'], '0.81')
    assert.equal(result.headers['set-cookie'], undefined)
  } finally {
    await fx.close()
  }
})

unixTest('streamGoWorker restores a streamed plan-limit error to 429 with a parsed reset', async () => {
  // Kernel cli-hop: HTTP 200, then `event: error` (sub2api sseStreamErrorEventError).
  const fx = await fixture((req, res) => {
    res.setHeader('content-type', 'text/event-stream')
    res.write('event: message_start\ndata: {"type":"message_start","message":{"content":[]}}\n\n')
    res.write(
      'event: error\ndata: {"type":"error","error":{"type":"api_error","message":"provider error: You\'ve hit your limit · resets 11am (America/New_York)"}}\n\n',
    )
    res.end()
  })
  try {
    const lines = []
    const result = await streamGoWorker({
      exec: fx.exec,
      body: { model: 'claude-haiku-4-5', stream: true, messages: [{ role: 'user', content: 'hi' }] },
      onEvent: (line) => lines.push(line),
    })
    assert.equal(result.ok, false)
    assert.equal(result.committed, false)
    assert.equal(result.status, 429)
    assert.equal(result.terminalState, 'rejected')
    assert.equal(result.streamError, true)
    assert.equal(result.headers['anthropic-ratelimit-unified-5h-status'], 'rejected')
    assert.ok(Number(result.headers['anthropic-ratelimit-unified-5h-reset']) * 1000 > Date.now())
    assert.equal(lines.length, 0)
  } finally {
    await fx.close()
  }
})

unixTest('streamGoWorker restores a streamed overloaded_error to 529', async () => {
  const fx = await fixture((req, res) => {
    res.setHeader('content-type', 'text/event-stream')
    res.write('event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}\n\n')
    res.end()
  })
  try {
    const result = await streamGoWorker({
      exec: fx.exec,
      body: { model: 'claude-haiku-4-5', stream: true, messages: [{ role: 'user', content: 'hi' }] },
      onEvent: () => {},
    })
    assert.equal(result.status, 529)
    assert.equal(result.terminalState, 'rejected')
  } finally {
    await fx.close()
  }
})

unixTest('streamGoWorker accepts an empty message_stop terminal', async () => {
  const fx = await fixture((req, res) => {
    res.setHeader('content-type', 'text/event-stream')
    res.write('data: {"type":"message_start","message":{"content":[]}}\n\n')
    res.write('data: {"type":"message_stop"}\n\n')
    res.end()
  })
  try {
    const result = await streamGoWorker({
      exec: fx.exec,
      body: { model: 'claude-haiku-4-5', stream: true, messages: [{ role: 'user', content: 'hi' }] },
      onEvent: () => {},
    })
    assert.equal(result.ok, true)
    assert.equal(result.terminalState, 'verified')
    assert.equal(result.sawMessageStop, true)
  } finally {
    await fx.close()
  }
})

unixTest('streamGoWorker does not turn a generic stream error into HTTP 502', async () => {
  const fx = await fixture((req, res) => {
    res.setHeader('content-type', 'text/event-stream')
    res.write('event: error\ndata: {"type":"error","error":{"type":"api_error","message":"provider error"}}\n\n')
    res.end()
  })
  try {
    const result = await streamGoWorker({
      exec: fx.exec,
      body: { model: 'claude-haiku-4-5', stream: true, messages: [{ role: 'user', content: 'hi' }] },
      onEvent: () => {},
    })
    assert.equal(result.status, 200)
    assert.equal(result.body.error.code, 'empty_response')
    assert.equal(result.terminalState, 'incomplete')
  } finally {
    await fx.close()
  }
})

unixTest('streamGoWorker preserves organization permission denial before downstream commit', async () => {
  const message =
    'provider error: provider error: Your organization does not have access to Claude. Please login again or contact your administrator.'
  const fx = await fixture((req, res) => {
    res.setHeader('content-type', 'text/event-stream')
    res.setHeader('trailer', 'x-kin-terminal-state')
    res.write(`event: error\ndata: ${JSON.stringify({ type: 'error', error: { type: 'api_error', message } })}\n\n`)
    res.addTrailers({ 'x-kin-terminal-state': 'incomplete' })
    res.end()
  })
  try {
    const result = await streamGoWorker({
      exec: fx.exec,
      body: { model: 'claude-haiku-4-5', stream: true, messages: [{ role: 'user', content: 'hi' }] },
      onCommit: () => assert.fail('permission denial must not commit the downstream'),
      onEvent: () => {},
    })
    assert.equal(result.status, 403)
    assert.equal(result.body.error.message, message)
    assert.equal(result.terminalState, 'rejected')
    assert.equal(result.committed, false)
  } finally {
    await fx.close()
  }
})

unixTest('callGoWorker restores organization permission denial from a kernel provider error', async () => {
  const message =
    'provider error: Your organization does not have access to Claude. Please login again or contact your administrator.'
  const fx = await fixture((req, res) => {
    res.statusCode = 502
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ type: 'error', error: { type: 'worker_error', code: 'provider_error', message } }))
  })
  try {
    const result = await callGoWorker({
      exec: fx.exec,
      body: { model: 'claude-haiku-4-5', messages: [{ role: 'user', content: 'hi' }] },
    })
    assert.equal(result.status, 403)
    assert.equal(result.body.error.message, message)
    assert.equal(result.terminalState, 'rejected')
  } finally {
    await fx.close()
  }
})

unixTest('callGoWorker restores a kernel 502 provider_error plan limit to 429', async () => {
  const fx = await fixture((req, res) => {
    res.statusCode = 502
    res.setHeader('content-type', 'application/json')
    res.end(
      JSON.stringify({
        type: 'error',
        error: { type: 'worker_error', code: 'provider_error', message: "provider error: You've hit your limit" },
      }),
    )
  })
  try {
    const result = await callGoWorker({
      exec: fx.exec,
      body: { model: 'claude-haiku-4-5', messages: [{ role: 'user', content: 'hi' }] },
    })
    assert.equal(result.status, 429)
    assert.equal(result.headers['anthropic-ratelimit-unified-5h-status'], 'rejected')
  } finally {
    await fx.close()
  }
})

unixTest('streamGoWorker scrapes usage from SSE when trailers are missing', async () => {
  const fx = await fixture((req, res) => {
    res.setHeader('content-type', 'text/event-stream')
    res.write(
      'data: {"type":"message_start","message":{"model":"claude-sonnet-5","usage":{"input_tokens":80,"cache_read_input_tokens":20}}}\n\n',
    )
    res.write('data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":"ok"}}\n\n')

    res.write('data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":6}}\n\n')
    res.write('data: {"type":"message_stop"}\n\n')
    res.end()
  })
  try {
    const result = await streamGoWorker({
      exec: fx.exec,
      body: { model: 'claude-sonnet-5', stream: true, messages: [{ role: 'user', content: 'hi' }] },
      onEvent: () => {},
    })
    assert.equal(result.usage.input_tokens, 80)
    assert.equal(result.usage.output_tokens, 6)
    assert.equal(result.usage.cache_read_input_tokens, 20)
    assert.equal(result.model, 'claude-sonnet-5')
    assert.equal(result.stopReason, 'end_turn')
  } finally {
    await fx.close()
  }
})

unixTest('streamGoWorker merges SSE cache details into a totals-only usage trailer', async () => {
  const fx = await fixture((req, res) => {
    res.setHeader('content-type', 'text/event-stream')
    res.setHeader('trailer', 'x-kin-terminal-state, x-kin-usage')
    res.write('data: {"type":"response.created","response":{"id":"resp_1","model":"gpt-5.4"}}\n\n')
    res.write('data: {"type":"response.output_text.delta","delta":"hi"}\n\n')
    res.write(
      'data: {"type":"response.completed","response":{"id":"resp_1","model":"gpt-5.4","usage":{"input_tokens":120,"output_tokens":9,"total_tokens":129,"input_tokens_details":{"cached_tokens":8}}}}\n\n',
    )
    res.addTrailers({
      'x-kin-terminal-state': 'verified',
      'x-kin-usage': JSON.stringify({ input_tokens: 120, output_tokens: 9 }),
    })
    res.end()
  })
  try {
    const result = await streamGoWorker({
      exec: fx.exec,
      body: { model: 'gpt-5.4', stream: true, input: [] },
      onEvent: () => {},
    })
    assert.equal(result.usage.input_tokens, 120)
    assert.equal(result.usage.output_tokens, 9)
    assert.equal(result.usage.input_tokens_details.cached_tokens, 8)
    assert.equal(extractOpenaiUsage(result.usage).cached_tokens, 8)
  } finally {
    await fx.close()
  }
})

test('terminal metadata is not a downstream commit', () => {
  assert.equal(isDownstreamCommitEvent({ type: 'message_start', message: {} }), false)
  assert.equal(isDownstreamCommitEvent({ type: 'error', error: { message: 'Connection error' } }), false)
  assert.equal(isDownstreamCommitEvent({ type: 'message_stop' }), false)
  assert.equal(isDownstreamCommitEvent({ type: 'message_delta', delta: { stop_reason: 'end_turn' } }), false)
  assert.equal(isDownstreamCommitEvent({ type: 'message_delta', delta: {} }), false)
  assert.equal(
    isDownstreamCommitEvent({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'hi' } }),
    true,
  )
  assert.equal(
    isDownstreamCommitEvent({
      type: 'content_block_start',
      content_block: { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search' },
    }),
    true,
  )
})

unixTest('streamGoWorker assembles text+stop_reason even without message_stop', async () => {
  const fx = await fixture((req, res) => {
    res.setHeader('content-type', 'text/event-stream')
    res.write('data: {"type":"message_start","message":{"type":"message","role":"assistant","content":[]}}\n\n')
    res.write('data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n')
    res.write('data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hello"}}\n\n')
    res.write('data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":1}}\n\n')
    res.end()
  })
  try {
    const lines = []
    const result = await streamGoWorker({
      exec: fx.exec,
      body: { model: 'claude-sonnet-5', stream: true, messages: [{ role: 'user', content: 'hi' }] },
      onEvent: (line) => lines.push(line),
    })
    assert.equal(result.ok, true)
    assert.equal(result.committed, true)
    assert.equal(result.terminalState, 'verified')
    assert.equal(result.stopReason, 'end_turn')
    assert.equal(result.body.content[0].text, 'hello')
    assert.ok(lines.some((line) => line.includes('text_delta')))
  } finally {
    await fx.close()
  }
})

unixTest('streamGoWorker does not commit or forward a Connection error after message_start', async () => {
  const fx = await fixture((req, res) => {
    res.setHeader('content-type', 'text/event-stream')
    res.write('data: {"type":"message_start","message":{}}\n\n')
    res.write(
      'data: {"type":"error","error":{"type":"api_error","message":"provider error: provider error: Connection error."}}\n\n',
    )
    res.end()
  })
  try {
    const lines = []
    const result = await streamGoWorker({
      exec: fx.exec,
      body: { model: 'claude-haiku-4-5', stream: true, messages: [{ role: 'user', content: 'hi' }] },
      onEvent: (line) => lines.push(line),
    })
    assert.equal(result.committed, false)
    assert.equal(result.ok, false)
    assert.match(String(result.body?.error?.message || ''), /Connection error/)
    assert.equal(lines.length, 0)
  } finally {
    await fx.close()
  }
})

test('usageFromSseEvent reads Anthropic message_start and message_delta', () => {
  assert.deepEqual(
    usageFromSseEvent({ type: 'message_start', message: { usage: { input_tokens: 80, cache_read_input_tokens: 20 } } }),
    { input_tokens: 80, cache_read_input_tokens: 20 },
  )
  assert.deepEqual(usageFromSseEvent({ type: 'message_delta', usage: { output_tokens: 6 } }), { output_tokens: 6 })
  assert.equal(usageFromSseEvent({ type: 'content_block_delta' }), null)
})

test('usageFromSseEvent reads OpenAI Responses nested usage', () => {
  assert.deepEqual(
    usageFromSseEvent({
      type: 'response.completed',
      response: { usage: { input_tokens: 41, output_tokens: 12, input_tokens_details: { cached_tokens: 8 } } },
    }),
    { input_tokens: 41, output_tokens: 12, input_tokens_details: { cached_tokens: 8 } },
  )
})

test('workerHealth fails closed when socket is absent', async () => {
  const result = await workerHealth(
    {
      homeDir: '/tmp/not-present/cli-home',
      vm: { runtime: { worker_socket: '/tmp/not-present/worker.sock' } },
    },
    { timeoutMs: 20 },
  )
  assert.equal(result.ok, false)
})
