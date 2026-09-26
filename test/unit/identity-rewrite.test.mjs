import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyCrsIdentityReplace,
  buildStableSessionSeed,
  extractCallerSession,
  normalizeSessionUserAgent,
  resolveOutboundSessionId,
  resolveInboundIdentity,
  sessionContextDiscriminator,
  STABLE_SESSION_SEED,
  uuidFromSeed,
  UNOFFICIAL_SESSION_SEED,
  parseUserId,
} from '../../src/lib/identity/identity-rewrite.mjs'
import { stampBillingPromptId } from '../../src/lib/identity/crs-persona.mjs'

const SLOT = {
  vmId: 'vm-01',
  deviceId: 'vm-dev',
  accountUuid: 'vm-acc',
  sessionId: 'vm-sess',
  email: 'slot@example.com',
  metadataUserId: JSON.stringify({ device_id: 'vm-dev', account_uuid: 'vm-acc', session_id: 'vm-sess' }),
}

test('unofficial identity: device/account are slot, session is minted not caller raw', () => {
  const body = {
    settings: { theme: 'light' },
    metadata: {
      user_id: JSON.stringify({ device_id: 'win-dev', account_uuid: 'win-acc', session_id: 'win-sess' }),
      machine_id: 'pc',
    },
  }
  const out = applyCrsIdentityReplace(body, SLOT, body)
  const uid = JSON.parse(out.metadata.user_id)
  const minted = uuidFromSeed(UNOFFICIAL_SESSION_SEED + 'win-sess')
  assert.equal(uid.device_id, 'vm-dev')
  assert.equal(uid.account_uuid, 'vm-acc')
  assert.equal(uid.session_id, minted)
  assert.notEqual(uid.session_id, 'win-sess')
  assert.notEqual(uid.session_id, 'vm-sess')
  assert.equal(uid.email, undefined)
  assert.equal(String(out.metadata.user_id).includes('@'), false)
  assert.equal(out.settings, undefined)
  assert.equal(out.metadata.machine_id, undefined)
})

test('official Claude Code identity keeps the caller session', () => {
  const body = {
    metadata: {
      user_id: JSON.stringify({ device_id: 'win-dev', account_uuid: 'win-acc', session_id: 'win-sess' }),
    },
  }
  const out = applyCrsIdentityReplace(body, SLOT, body, {}, { officialClient: true })
  const uid = JSON.parse(out.metadata.user_id)
  assert.equal(uid.session_id, 'win-sess')
  assert.equal(uid.device_id, 'vm-dev')
  assert.equal(uid.account_uuid, 'vm-acc')
})

test('resolveOutboundSessionId always returns a session', () => {
  const minted = resolveOutboundSessionId('caller-raw')
  assert.equal(minted, uuidFromSeed(UNOFFICIAL_SESSION_SEED + 'caller-raw'))
  assert.notEqual(minted, 'caller-raw')
  assert.equal(resolveOutboundSessionId('keep-me', { officialClient: true }), 'keep-me')
  assert.match(resolveOutboundSessionId('', { officialClient: true }), /^[0-9a-f-]{36}$/)
  assert.match(resolveOutboundSessionId(''), /^[0-9a-f-]{36}$/)
})

test('identity replace is stable for the same inbound session', () => {
  const inbound = { metadata: { user_id: JSON.stringify({ device_id: 'd1', session_id: 's1' }) } }
  const id = { accountUuid: 'acc', deviceId: 'vm', vmId: 'vm-01' }
  const a = applyCrsIdentityReplace({ model: 'x' }, id, inbound)
  const b = applyCrsIdentityReplace({ model: 'x' }, id, inbound)
  assert.deepEqual(JSON.parse(a.metadata.user_id), JSON.parse(b.metadata.user_id))
})

test('parseUserId accepts JSON, object, and legacy underscore formats', () => {
  const json = parseUserId(JSON.stringify({ device_id: 'd', account_uuid: 'a', session_id: 's' }))
  assert.deepEqual(json, {
    device_id: 'd',
    account_uuid: 'a',
    session_id: 's',
    parent_session_id: '',
    root_session_id: '',
  })
  const obj = parseUserId({ deviceId: 'd2', accountUuid: 'a2', sessionId: 's2' })
  assert.deepEqual(obj, {
    device_id: 'd2',
    account_uuid: 'a2',
    session_id: 's2',
    parent_session_id: '',
    root_session_id: '',
  })
  const legacy = parseUserId('user_dev1_account_acc1_session_sess1')
  assert.deepEqual(legacy, { device_id: 'dev1', account_uuid: 'acc1', session_id: 'sess1' })
  assert.equal(parseUserId(''), null)
})

test('extractCallerSession prefers metadata, then sticky headers, then body keys', () => {
  assert.equal(
    extractCallerSession({
      inbound: { metadata: { user_id: { session_id: 'from-meta' } } },
      headers: { 'x-session-id': 'from-header' },
    }),
    'from-meta',
  )
  assert.equal(
    extractCallerSession({
      inbound: { model: 'x' },
      headers: { 'x-claude-code-session-id': 'from-header' },
    }),
    'from-header',
  )
  assert.equal(
    extractCallerSession({
      inbound: { conversation_id: 'from-body' },
      headers: {},
    }),
    'from-body',
  )
})

test('resolveInboundIdentity accepts JSON string metadata.user_id', () => {
  const identity = resolveInboundIdentity({
    inbound: {
      metadata: {
        user_id: JSON.stringify({ device_id: 'device-json', account_uuid: 'account-json', session_id: 'session-json' }),
      },
    },
    body: { device_id: 'device-body' },
    headers: { 'x-kin-device-id': 'device-header' },
  })
  assert.deepEqual(identity, { sessionId: 'session-json', deviceId: 'device-json', source: 'metadata' })
})

test('resolveInboundIdentity accepts object metadata.user_id', () => {
  const identity = resolveInboundIdentity({
    body: {
      metadata: { user_id: { deviceId: 'device-object', accountUuid: 'account-object', sessionId: 'session-object' } },
    },
  })
  assert.deepEqual(identity, { sessionId: 'session-object', deviceId: 'device-object', source: 'metadata' })
})

test('resolveInboundIdentity accepts legacy metadata.user_id', () => {
  const identity = resolveInboundIdentity({
    inbound: { metadata: { user_id: 'user_device-legacy_account_account-legacy_session_session-legacy' } },
  })
  assert.deepEqual(identity, { sessionId: 'session-legacy', deviceId: 'device-legacy', source: 'metadata' })
})

test('resolveInboundIdentity uses explicit device_id body field when metadata lacks device', () => {
  const identity = resolveInboundIdentity({
    inbound: { metadata: { user_id: { session_id: 'session-meta', account_uuid: 'account-meta' } } },
    body: { device_id: 'device-explicit' },
    headers: { 'x-kin-device-id': 'device-header' },
  })
  assert.deepEqual(identity, { sessionId: 'session-meta', deviceId: 'device-explicit', source: 'explicit-device' })
})

test('resolveInboundIdentity uses x-kin-device-id header when no metadata device or body device exists', () => {
  const identity = resolveInboundIdentity({
    body: { metadata: { user_id: { session_id: 'session-meta' } } },
    headers: { 'X-Kin-Device-Id': 'device-header' },
  })
  assert.deepEqual(identity, { sessionId: 'session-meta', deviceId: 'device-header', source: 'explicit-device' })
})

test('resolveInboundIdentity does not guess identity from auth, ip, user agent, or message text', () => {
  const identity = resolveInboundIdentity({
    inbound: {
      messages: [{ role: 'user', content: 'stable first message' }],
    },
    body: {
      messages: [{ role: 'user', content: 'another stable first message' }],
    },
    headers: {
      authorization: 'Bearer secret-api-key',
      'x-api-key': 'another-secret-api-key',
      'x-forwarded-for': '203.0.113.9',
      'user-agent': 'claude-cli/2.1.241',
    },
  })
  assert.deepEqual(identity, { sessionId: '', deviceId: '', source: 'none' })
})

test('uuidFromSeed is a deterministic v4-shaped uuid', () => {
  const a = uuidFromSeed('seed')
  const b = uuidFromSeed('seed')
  assert.equal(a, b)
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
})

test('missing caller session is stable across turns and not random', () => {
  const base = {
    officialClient: false,
    accountId: 'vm-01',
    clientIp: '203.0.113.9',
    userAgent: 'claude-cli/2.1.241 (external, sdk-cli)',
    apiKeyId: 'key-7',
    firstUserText: 'first question',
  }
  const round1 = resolveOutboundSessionId('', base)
  const round2 = resolveOutboundSessionId('', { ...base, firstUserText: 'first question' })
  assert.equal(round1, round2)
  assert.match(round1, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.equal(
    round1,
    uuidFromSeed(
      STABLE_SESSION_SEED + buildStableSessionSeed('vm-01', sessionContextDiscriminator(base), 'first question'),
    ),
  )
  assert.notEqual(resolveOutboundSessionId('', { ...base, firstUserText: 'other opener' }), round1)
  assert.notEqual(resolveOutboundSessionId('', { ...base, accountId: 'vm-02' }), round1)
  assert.equal(resolveOutboundSessionId('', { ...base, userAgent: 'claude-cli/2.1.999 (external, sdk-cli)' }), round1)
})

test('sticky outbound id is reused for the same account and reminted after failover', () => {
  const opts = {
    accountId: 'vm-01',
    boundAccountId: 'vm-01',
    boundSessionId: '11111111-1111-4111-8111-111111111111',
    firstUserText: 'trimmed current turn',
    clientDiscriminator: '203.0.113.9:claude-cli+sdk-cli:key-7',
  }
  assert.equal(resolveOutboundSessionId('', opts), '11111111-1111-4111-8111-111111111111')
  const moved = resolveOutboundSessionId('', { ...opts, accountId: 'vm-02' })
  assert.notEqual(moved, opts.boundSessionId)
  assert.equal(resolveOutboundSessionId('', { ...opts, accountId: 'vm-02' }), moved)
  assert.equal(resolveOutboundSessionId('caller-raw', opts), uuidFromSeed(UNOFFICIAL_SESSION_SEED + 'caller-raw'))
  assert.equal(resolveOutboundSessionId('keep-me', { ...opts, officialClient: true }), 'keep-me')
})

test('session user agent ignores version noise', () => {
  assert.equal(
    normalizeSessionUserAgent('claude-cli/2.1.241 (external, sdk-cli)'),
    normalizeSessionUserAgent('claude-cli/9.9.9 (external, sdk-cli)'),
  )
  assert.equal(normalizeSessionUserAgent('claude-cli/2.1.241 (external, sdk-cli)'), 'claude-cli')
})

test('billing prompt id follows the stable outbound session', () => {
  const body = {
    system: [
      {
        type: 'text',
        text: 'x-anthropic-billing-header: cc_version=2.1.241.abc; cc_entrypoint=sdk-cli; cch=00000; cc_prompt_id=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa;',
      },
    ],
  }
  const stable = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const out = stampBillingPromptId(body, stable, 'first question')
  assert.match(out.system[0].text, new RegExp(`cc_prompt_id=${stable}`))
  assert.equal(body.system[0].text.includes('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), true)
})

test('resolveInboundIdentity keeps a metadata session_id when no device exists', () => {
  const identity = resolveInboundIdentity({
    inbound: { metadata: { user_id: JSON.stringify({ session_id: 'session-only' }) } },
  })
  assert.deepEqual(identity, { sessionId: 'session-only', deviceId: '', source: 'metadata' })
})

test('resolveInboundIdentity reads explicit device_id from the raw inbound body', () => {
  const identity = resolveInboundIdentity({
    inbound: { device_id: 'device-raw', metadata: { user_id: { session_id: 'session-raw' } } },
    body: {},
  })
  assert.deepEqual(identity, { sessionId: 'session-raw', deviceId: 'device-raw', source: 'explicit-device' })
})
