import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readRoutingConfigFile, routingConfigFile, streamIdleTimeoutMs } from '../../src/lib/core/config.mjs'

function withEnv(key, value, fn) {
  const prev = process.env[key]
  if (value == null) delete process.env[key]
  else process.env[key] = value
  try {
    return fn()
  } finally {
    if (prev == null) delete process.env[key]
    else process.env[key] = prev
  }
}

test('routingConfigFile prefers KIN_ROUTING_FILE then src/config/routing.json', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kin-routing-file-'))
  try {
    withEnv('KIN_ROUTING_FILE', '', () => {
      assert.equal(routingConfigFile(root), path.join(root, 'src', 'config', 'routing.json'))
    })
    withEnv('KIN_ROUTING_FILE', '/tmp/custom-routing.json', () => {
      assert.equal(routingConfigFile(root), '/tmp/custom-routing.json')
    })
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('readRoutingConfigFile reads src/config and ignores project/config', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kin-routing-read-'))
  try {
    fs.mkdirSync(path.join(root, 'config'), { recursive: true })
    fs.mkdirSync(path.join(root, 'src', 'config'), { recursive: true })
    fs.writeFileSync(path.join(root, 'config', 'routing.json'), JSON.stringify({ stale: true }))
    fs.writeFileSync(
      path.join(root, 'src', 'config', 'routing.json'),
      JSON.stringify({ compatibility: { persona_preset: 'official_full' } }),
    )
    withEnv('KIN_ROUTING_FILE', '', () => {
      const doc = readRoutingConfigFile(root)
      assert.equal(doc.stale, undefined)
      assert.equal(doc.compatibility.persona_preset, 'official_full')
    })
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('readRoutingConfigFile fails when the file is missing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kin-routing-missing-'))
  try {
    withEnv('KIN_ROUTING_FILE', '', () => {
      assert.throws(() => readRoutingConfigFile(root), /Routing config .*not found/)
    })
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('streamIdleTimeoutMs prefers the panel value, then the caller fallback', () => {
  withEnv('KIN_STREAM_IDLE_TIMEOUT', '', () => {
    assert.equal(streamIdleTimeoutMs(), 180_000)
    assert.equal(streamIdleTimeoutMs({ failover: {} }, 2000), 2000)
    assert.equal(streamIdleTimeoutMs({ failover: { stream_idle_timeout_ms: 900_000 } }, 2000), 900_000)
    assert.equal(streamIdleTimeoutMs({ failover: { stream_idle_timeout_ms: 'bad' } }), 180_000)
    assert.equal(streamIdleTimeoutMs({ failover: { stream_idle_timeout_ms: 1 } }), 30_000)
  })
  withEnv('KIN_STREAM_IDLE_TIMEOUT', '240000', () => {
    assert.equal(streamIdleTimeoutMs(null), 240_000)
  })
})

test('readRoutingConfigFile identifies invalid JSON', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kin-routing-invalid-'))
  try {
    fs.mkdirSync(path.join(root, 'src', 'config'), { recursive: true })
    fs.writeFileSync(path.join(root, 'src', 'config', 'routing.json'), '{invalid')
    withEnv('KIN_ROUTING_FILE', '', () => {
      assert.throws(() => readRoutingConfigFile(root), /Routing config .*invalid JSON/)
    })
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
