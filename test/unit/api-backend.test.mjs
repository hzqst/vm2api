import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { createHandleProtocol } from '../../src/lib/protocol/handle-protocol.mjs'
import { StickyRouter } from '../../src/lib/pool/sticky-router.mjs'
import { CRS_OFFICIAL_AGENT_PROMPT } from '../../src/lib/identity/crs-persona.mjs'
import { resolveInferenceBackend, messagesUrl } from '../../src/lib/pool/api-protocol.mjs'

function fakeResponse() {
  return { headersSent: false, on() {}, once() {}, off() {}, write() {}, end() {} }
}

function messageStart() {
  return `data: ${JSON.stringify({
    type: 'message_start',
    message: { type: 'message', role: 'assistant', content: [], model: 'upstream-model' },
  })}\n\n`
}

test('managed key category selects backend', () => {
  assert.equal(resolveInferenceBackend({ apiKeyKind: 'managed', apiKeyRecord: { category: 'api' } }), 'api')
  assert.equal(resolveInferenceBackend({ apiKeyKind: 'managed', apiKeyRecord: { category: 'oauth' } }), 'oauth')
  assert.equal(resolveInferenceBackend({ apiKeyKind: 'managed', apiKeyRecord: {} }), 'oauth')
})

test('master key defaults oauth unless x-kin-backend=api', () => {
  assert.equal(resolveInferenceBackend({ apiKeyKind: 'master', headers: {} }), 'oauth')
  assert.equal(resolveInferenceBackend({ apiKeyKind: 'master', headers: { 'x-kin-backend': 'api' } }), 'api')
})

test('messagesUrl appends /v1/messages?beta=true', () => {
  assert.equal(messagesUrl('https://api.example.com'), 'https://api.example.com/v1/messages?beta=true')
  assert.equal(messagesUrl('https://api.example.com/'), 'https://api.example.com/v1/messages?beta=true')
})

test('API backend applies the global official_full persona setting', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kin-api-persona-'))
  const routingFile = path.join(root, 'routing.json')
  const socketPath = path.join(root, 'run', 'api-kernel.sock')
  fs.mkdirSync(path.dirname(socketPath), { recursive: true })
  fs.writeFileSync(
    routingFile,
    JSON.stringify({ compatibility: { persona_preset: 'official_full', overlay_preset: 'off' } }),
  )
  let received = null
  const kernel = http.createServer((req, res) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      received = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.end(messageStart())
    })
  })
  await new Promise((resolve, reject) => {
    kernel.once('error', reject)
    kernel.listen(socketPath, resolve)
  })
  const response = fakeResponse()
  const stats = { errors: 0, requests: 0, by_route: {}, passthrough: 0, rewrite: 0, convert: 0 }
  const handler = createHandleProtocol({
    json: (_res, status, body) => {
      response.status = status
      response.body = body
      return body
    },
    writeSSEHeaders() {},
    readBody: async () => ({ model: 'claude-haiku-4-5', messages: [{ role: 'user', content: 'hello' }] }),
    requireAuth: () => true,
    cfg: {
      rewrite: { enabled: false },
      intercept: { rules: [] },
      distill: { enabled: false },
      limits: { max_body_bytes: 1024 * 1024, upstream_timeout_ms: 2000 },
      paths: { data: root },
    },
    requestLog: { start: () => ({ request_id: 'api-persona-test' }), finish() {} },
    stickyRouter: {},
    accountQuota: {},
    apiKeyStore: {},
    apiScheduler: {
      pick: () => ({
        ok: true,
        endpoint: { id: 'ep-test', kind: 'claude', protocol: 'anthropic', base_url: 'https://upstream.invalid' },
        upstream_model: 'claude-haiku-4-5',
        key: { id: 'key-test', api_key: 'secret' },
      }),
    },
    apiEndpointStore: {},
    stats,
    routingConfigPath: routingFile,
    routingConfig: {
      compatibility: { persona_preset: 'official_full', overlay_preset: 'off' },
      failover: {},
    },
    groupsRepo: { rateMultiplier: () => 1 },
  })
  const req = {
    method: 'POST',
    url: '/v1/messages',
    headers: { authorization: 'Bearer master', 'x-kin-backend': 'api', 'user-agent': 'test-client' },
    apiKeyKind: 'master',
    once() {},
    off() {},
  }
  try {
    await handler.handleProtocol(req, response, 'anthropic.messages', '/v1/messages')
    assert.equal(response.status, 200)
    assert.ok(received)
    const outbound = JSON.parse(received.body)
    assert.equal(outbound.system.length, 4)
    assert.equal(outbound.system[2].text, CRS_OFFICIAL_AGENT_PROMPT)
  } finally {
    await new Promise((resolve) => kernel.close(resolve))
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('OAuth cli-hop applies the resolved Protocol custom persona template', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kin-slot-persona-'))
  const routingFile = path.join(root, 'routing.json')
  const compatibility = {
    persona_preset: 'custom',
    persona_inject: 'rewrite',
    persona_templates: {
      custom: [{ id: 'custom', type: 'text', text: 'CUSTOM_PERSONA {{timezone}}' }],
    },
  }
  fs.writeFileSync(routingFile, JSON.stringify({ compatibility }))
  const vm = { id: 'vm-01', claude: { mode: 'oauth' } }
  const selected = {
    vmId: vm.id,
    accountId: 'account-1',
    vm,
    exec: {
      vmId: vm.id,
      vm,
      homeDir: path.join(root, 'home'),
      oauth: { account_uuid: 'account-1' },
      timezone: 'UTC',
      locale: 'en_US.UTF-8',
    },
  }
  let prepared = null
  const response = fakeResponse()
  const stats = { errors: 0, requests: 0, by_route: {}, passthrough: 0, rewrite: 0, convert: 0 }
  const handler = createHandleProtocol({
    json: (_res, status, body) => {
      response.status = status
      response.body = body
      return body
    },
    writeSSEHeaders() {},
    readBody: async () => ({ model: 'claude-haiku-4-5', messages: [{ role: 'user', content: 'hello' }] }),
    requireAuth: () => true,
    cfg: {
      rewrite: { enabled: false },
      intercept: { rules: [] },
      distill: { enabled: false },
      limits: { max_body_bytes: 1024 * 1024, upstream_timeout_ms: 2000, stream_idle_timeout_ms: 2000 },
      paths: { data: root, project: root },
    },
    requestLog: { start: () => ({ request_id: 'slot-persona-test' }), finish() {} },
    stickyRouter: { extractPoolKey: () => null, collectPoolKeys: () => [] },
    accountQuota: {},
    apiKeyStore: {},
    apiScheduler: {},
    apiEndpointStore: {},
    stats,
    routingConfigPath: routingFile,
    routingConfig: { compatibility, failover: {} },
    failoverRunner: {
      async run(opts) {
        prepared = await opts.applyAttempt(opts.canonicalBody, selected)
        return {
          ok: false,
          status: 503,
          body: { error: { type: 'server_error', code: 'upstream_error', message: 'test stop' } },
          headers: {},
        }
      },
    },
    groupsRepo: { rateMultiplier: () => 1 },
  })
  const req = {
    method: 'POST',
    url: '/v1/messages',
    headers: { authorization: 'Bearer master', 'user-agent': 'Go-http-client/2.0' },
    apiKeyKind: 'master',
    once() {},
    off() {},
  }

  try {
    await handler.handleProtocol(req, response, 'anthropic.messages', '/v1/messages')
    assert.equal(response.status, 503)
    assert.ok(prepared?.body)
    assert.equal(prepared.body.system.length, 1)
    assert.equal(prepared.body.system[0].text, 'CUSTOM_PERSONA UTC')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('OpenAI chat carrying claude-opus-4-8 uses the Claude pool', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kin-opus-platform-'))
  const routingFile = path.join(root, 'routing.json')
  fs.writeFileSync(routingFile, JSON.stringify({ compatibility: { persona_preset: 'zero' } }))
  let poolCalls = 0
  let requestedModel = null
  const response = fakeResponse()
  const handler = createHandleProtocol({
    json: (_res, status, body) => {
      response.status = status
      response.body = body
      return body
    },
    writeSSEHeaders() {},
    readBody: async () => ({
      model: 'claude-opus-4-8',
      stream: false,
      max_tokens: 64,
      messages: [{ role: 'user', content: 'hello' }],
    }),
    requireAuth: () => true,
    cfg: {
      rewrite: { enabled: false },
      intercept: { rules: [] },
      distill: { enabled: false },
      limits: { max_body_bytes: 1024 * 1024, upstream_timeout_ms: 2000, stream_idle_timeout_ms: 2000 },
      paths: { data: root, project: root },
    },
    requestLog: { start: () => ({ request_id: 'opus-platform-test' }), finish() {} },
    stickyRouter: { extractPoolKey: () => 'opus-session', collectPoolKeys: () => ['opus-session'] },
    accountQuota: {},
    apiKeyStore: {},
    apiScheduler: {},
    apiEndpointStore: {},
    stats: { errors: 0, requests: 0, by_route: {}, passthrough: 0, rewrite: 0, convert: 0 },
    routingConfigPath: routingFile,
    routingConfig: { compatibility: { persona_preset: 'zero' }, failover: {} },
    failoverRunner: {
      async run(opts) {
        poolCalls += 1
        requestedModel = opts.model
        return {
          ok: false,
          status: 503,
          body: { error: { type: 'server_error', code: 'pool_probe', message: 'Claude pool selected' } },
          headers: {},
        }
      },
    },
    groupsRepo: { rateMultiplier: () => 1 },
  })
  const req = {
    method: 'POST',
    url: '/v1/chat/completions',
    headers: { authorization: 'Bearer master', 'user-agent': 'OpenAI/Node' },
    apiKeyKind: 'master',
    once() {},
    off() {},
  }

  try {
    await handler.handleProtocol(req, response, 'openai.chat', '/v1/chat/completions')
    assert.equal(poolCalls, 1)
    assert.equal(requestedModel, 'claude-opus-4-8')
    assert.equal(response.status, 503)
    assert.equal(response.body.error.message, 'Claude pool selected')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

function companionHaikuBody(sessionId, deviceId = 'device-probe') {
  return {
    model: 'claude-haiku-4-5',
    stream: false,
    max_tokens: 64,
    tools: [],
    system: [
      { type: 'text', text: 'x-anthropic-billing-header: cc_version=2.1.280.e2f; cch=test' },
      { type: 'text', text: "You are Claude Code, Anthropic's official CLI for Claude." },
    ],
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: 'Compress into one routing hint of at most 12 words: WHEN to use; WHEN NOT' }],
      },
    ],
    metadata: { user_id: JSON.stringify({ device_id: deviceId, session_id: sessionId }) },
  }
}

function protocolHarness({ body, stickyRouter, failoverRunner, apiKeyRecord = null }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kin-protocol-seat-'))
  const routingFile = path.join(root, 'routing.json')
  fs.writeFileSync(routingFile, JSON.stringify({ compatibility: { persona_preset: 'zero' } }))
  const response = fakeResponse()
  const stats = { errors: 0, requests: 0, by_route: {}, passthrough: 0, rewrite: 0, convert: 0 }
  const apiKeyCalls = { acquire: 0, release: 0 }
  const authCalls = { count: 0 }
  const handler = createHandleProtocol({
    json: (_res, status, payload) => {
      response.status = status
      response.body = payload
      return payload
    },
    writeSSEHeaders() {},
    readBody: async () => body,
    requireAuth: () => {
      authCalls.count += 1
      return true
    },
    cfg: {
      rewrite: { enabled: false },
      intercept: { rules: [] },
      distill: { enabled: false },
      limits: { max_body_bytes: 1024 * 1024, upstream_timeout_ms: 2000, stream_idle_timeout_ms: 2000 },
      paths: { data: root, project: root },
    },
    requestLog: { start: () => ({ request_id: 'seat-probe-test' }), finish() {} },
    stickyRouter,
    accountQuota: {},
    apiKeyStore: {
      acquire: () => {
        apiKeyCalls.acquire += 1
        return { ok: true }
      },
      release: () => {
        apiKeyCalls.release += 1
      },
    },
    apiScheduler: {},
    apiEndpointStore: {},
    stats,
    routingConfigPath: routingFile,
    routingConfig: { compatibility: { persona_preset: 'zero' }, failover: {} },
    failoverRunner,
    groupsRepo: { rateMultiplier: () => 1 },
  })
  const req = {
    method: 'POST',
    url: '/v1/messages',
    headers: { authorization: 'Bearer test', 'user-agent': 'Go-http-client/2.0' },
    apiKeyKind: apiKeyRecord ? 'managed' : 'master',
    apiKeyRecord,
    once() {},
    off() {},
  }
  return { root, handler, req, response, stats, apiKeyCalls, authCalls }
}

test('companion Haiku probe clears session sticky and skips session seat', async () => {
  let runOpts = null
  const stickyCalls = { extract: 0, collect: 0, device: 0 }
  const stickyRouter = {
    extractPoolKey: () => {
      stickyCalls.extract += 1
      return 'session-key'
    },
    collectPoolKeys: () => {
      stickyCalls.collect += 1
      return ['session-key']
    },
    canonicalDeviceKey: (deviceId) => {
      stickyCalls.device += 1
      return `dev2:${deviceId}`
    },
  }
  const harness = protocolHarness({
    body: companionHaikuBody('probe-session', 'probe-device'),
    stickyRouter,
    apiKeyRecord: { id: 'managed-key-1', group_id: 1 },
    failoverRunner: {
      async run(opts) {
        runOpts = opts
        return {
          ok: false,
          status: 503,
          body: { error: { type: 'server_error', code: 'probe_stop', message: 'stop' } },
          headers: {},
        }
      },
    },
  })
  try {
    await harness.handler.handleProtocol(harness.req, harness.response, 'anthropic.messages', '/v1/messages')
    assert.equal(harness.authCalls.count, 1)
    assert.equal(harness.apiKeyCalls.acquire, 1)
    assert.equal(harness.apiKeyCalls.release, 1)
    assert.equal(stickyCalls.extract, 1)
    assert.equal(stickyCalls.collect, 1)
    assert.equal(stickyCalls.device, 1)
    assert.equal(runOpts.stickyKey, null)
    assert.deepEqual(runOpts.stickyKeys, [])
    assert.equal(runOpts.skipSessionSeat, true)
    assert.equal(runOpts.stickyDeviceId, 'probe-device')
    assert.equal(runOpts.deviceKey, 'dev2:probe-device')
    assert.equal(harness.response.status, 503)
  } finally {
    fs.rmSync(harness.root, { recursive: true, force: true })
  }
})

test('ordinary Haiku with tools keeps session sticky and session seat', async () => {
  let runOpts = null
  const body = {
    ...companionHaikuBody('normal-session', 'normal-device'),
    tools: [{ name: 'Read', input_schema: { type: 'object', properties: {} } }],
  }
  const harness = protocolHarness({
    body,
    stickyRouter: {
      extractPoolKey: () => 'normal-sticky',
      collectPoolKeys: () => ['normal-sticky'],
      canonicalDeviceKey: (deviceId) => `dev2:${deviceId}`,
    },
    failoverRunner: {
      async run(opts) {
        runOpts = opts
        return {
          ok: false,
          status: 503,
          body: { error: { type: 'server_error', code: 'normal_stop', message: 'stop' } },
          headers: {},
        }
      },
    },
  })
  try {
    await harness.handler.handleProtocol(harness.req, harness.response, 'anthropic.messages', '/v1/messages')
    assert.equal(runOpts.stickyKey, 'normal-sticky')
    assert.deepEqual(runOpts.stickyKeys, ['normal-sticky'])
    assert.equal(runOpts.skipSessionSeat, false)
    assert.equal(runOpts.deviceKey, 'dev2:normal-device')
  } finally {
    fs.rmSync(harness.root, { recursive: true, force: true })
  }
})

async function captureRunOpts({ body, stickyRouter, apiKeyRecord }) {
  let runOpts = null
  const harness = protocolHarness({
    body,
    stickyRouter,
    apiKeyRecord,
    failoverRunner: {
      async run(opts) {
        runOpts = opts
        return {
          ok: false,
          status: 503,
          body: { error: { type: 'server_error', code: 'identity_stop', message: 'stop' } },
          headers: {},
        }
      },
    },
  })
  try {
    await harness.handler.handleProtocol(harness.req, harness.response, 'anthropic.messages', '/v1/messages')
  } finally {
    fs.rmSync(harness.root, { recursive: true, force: true })
  }
  return runOpts
}

function sessionBody(userId, extra = {}) {
  return {
    model: 'claude-sonnet-4-5',
    stream: false,
    max_tokens: 64,
    messages: [{ role: 'user', content: 'hello' }],
    metadata: { user_id: typeof userId === 'string' ? userId : JSON.stringify(userId) },
    ...extra,
  }
}

function realStickyRouter() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kin-identity-sticky-'))
  return { dir, router: new StickyRouter({ dataDir: dir, config: { sticky: { enabled: true, ttl_seconds: 600 } } }) }
}

test('inbound session and device keys match across API keys at the protocol entry', async () => {
  const { dir, router } = realStickyRouter()
  try {
    const body = sessionBody({ device_id: 'dev-cross', account_uuid: 'acct-a', session_id: 'sess-cross' })
    const a = await captureRunOpts({ body, stickyRouter: router, apiKeyRecord: { id: 'key-a', group_id: 1 } })
    const b = await captureRunOpts({
      body: sessionBody({ device_id: 'dev-cross', account_uuid: 'acct-b', session_id: 'sess-cross' }),
      stickyRouter: router,
      apiKeyRecord: { id: 'key-b', group_id: 1 },
    })
    assert.equal(a.stickyKey, 'sess:sess-cross')
    assert.equal(b.stickyKey, a.stickyKey)
    assert.deepEqual(b.stickyKeys, [a.stickyKey])
    assert.equal(a.deviceKey, 'dev2:dev-cross')
    assert.equal(b.deviceKey, a.deviceKey)
    for (const opts of [a, b]) {
      for (const key of [opts.stickyKey, ...opts.stickyKeys, opts.deviceKey, opts.familyKey]) {
        assert.doesNotMatch(String(key), /key-a|key-b|^k|:k/)
      }
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('shared API key keeps different devices apart at the protocol entry', async () => {
  const { dir, router } = realStickyRouter()
  try {
    const apiKeyRecord = { id: 'shared-key', group_id: 1 }
    const a = await captureRunOpts({
      body: sessionBody({ device_id: 'dev-one', session_id: 'sess-one' }),
      stickyRouter: router,
      apiKeyRecord,
    })
    const b = await captureRunOpts({
      body: sessionBody({ device_id: 'dev-two', session_id: 'sess-two' }),
      stickyRouter: router,
      apiKeyRecord,
    })
    assert.notEqual(a.stickyKey, b.stickyKey)
    assert.notEqual(a.deviceKey, b.deviceKey)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('explicit body device_id is the fallback when metadata has no device', async () => {
  const { dir, router } = realStickyRouter()
  try {
    const opts = await captureRunOpts({
      body: sessionBody({ session_id: 'sess-fallback' }, { device_id: 'dev-explicit' }),
      stickyRouter: router,
      apiKeyRecord: { id: 'key-fallback', group_id: 1 },
    })
    assert.equal(opts.stickyKey, 'sess:sess-fallback')
    assert.equal(opts.stickyDeviceId, 'dev-explicit')
    assert.equal(opts.deviceKey, 'dev2:dev-explicit')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('legacy API-key-scoped session row migrates lazily at the protocol entry', async () => {
  const { dir, router } = realStickyRouter()
  try {
    const apiKeyRecord = { id: 'key-old', group_id: 1 }
    const legacyKey = 'p:anthropic:kkey-old:sess-legacy'
    router.bind(legacyKey, { accountId: 'acc-legacy', vmId: 'vm-legacy', sessionId: 'out-legacy', slotIndex: 1 })
    router.bind('p:anthropic:kkey-old:unrelated', { accountId: 'acc-x', vmId: 'vm-x' })
    const opts = await captureRunOpts({
      body: sessionBody({ device_id: 'dev-legacy', session_id: 'sess-legacy' }),
      stickyRouter: router,
      apiKeyRecord,
    })
    assert.equal(opts.stickyKey, 'sess:sess-legacy')
    assert.deepEqual(opts.stickyKeys, ['sess:sess-legacy', legacyKey])
    const hit = router.resolve('sess:sess-legacy')
    assert.equal(hit.vmId, 'vm-legacy')
    assert.equal(hit.accountId, 'acc-legacy')
    assert.equal(router.resolve('dev2:dev-legacy').vmId, 'vm-legacy')
    assert.equal(router.resolve(legacyKey).vmId, 'vm-legacy')
    assert.equal(router.resolve('p:anthropic:kkey-old:unrelated').vmId, 'vm-x')

    // A different API key now reaches the same session binding.
    const other = await captureRunOpts({
      body: sessionBody({ device_id: 'dev-legacy', session_id: 'sess-legacy' }),
      stickyRouter: router,
      apiKeyRecord: { id: 'key-new', group_id: 1 },
    })
    assert.equal(other.stickyKey, 'sess:sess-legacy')
    assert.deepEqual(other.stickyKeys, ['sess:sess-legacy'])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('parent and child family key is shared across API keys and inherits a live legacy family', async () => {
  const { dir, router } = realStickyRouter()
  try {
    router.bind('p:anthropic:kkey-p:family:parent-sess', { accountId: 'acc-fam', vmId: 'vm-fam' })
    const parent = await captureRunOpts({
      body: sessionBody({ device_id: 'dev-fam', session_id: 'parent-sess' }),
      stickyRouter: router,
      apiKeyRecord: { id: 'key-p', group_id: 1 },
    })
    const child = await captureRunOpts({
      body: sessionBody({ device_id: 'dev-fam', session_id: 'child-sess', parent_session_id: 'parent-sess' }),
      stickyRouter: router,
      apiKeyRecord: { id: 'key-c', group_id: 1 },
    })
    assert.equal(parent.familyKey, 'family2:parent-sess')
    assert.equal(child.familyKey, parent.familyKey)
    assert.equal(parent.familyVmId, 'vm-fam')
    assert.equal(child.familyVmId, 'vm-fam')
    assert.notEqual(child.stickyKey, parent.stickyKey)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('request without trusted session id keeps the legacy scoped sticky key', async () => {
  const { dir, router } = realStickyRouter()
  try {
    const body = {
      model: 'claude-sonnet-4-5',
      stream: false,
      max_tokens: 64,
      messages: [{ role: 'user', content: 'no identity here' }],
    }
    const opts = await captureRunOpts({ body, stickyRouter: router, apiKeyRecord: { id: 'key-anon', group_id: 1 } })
    assert.match(String(opts.stickyKey), /^p:anthropic:kkey-anon:ch:/)
    assert.equal(opts.deviceKey, null)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
