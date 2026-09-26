import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluateSlotGate } from '../../src/lib/pool/schedule-eligibility.mjs'
import { isCodexVm, normalizeVmKind, stampVmKind } from '../../src/lib/vm/vm-kind.mjs'
import { summarizeVm } from '../../src/lib/vm/vm-registry.mjs'
import { buildRecreatedVmRecord } from '../../src/lib/vm/vm-recreate.mjs'

test('null or non-object VM is Claude, not a TypeError', () => {
  assert.equal(normalizeVmKind(null).kind, 'claude')
  assert.equal(normalizeVmKind(undefined).kind, 'claude')
  assert.equal(isCodexVm(null), false)
  assert.equal(isCodexVm(undefined), false)
})

test('unmarked VM is Claude', () => {
  const kind = normalizeVmKind({ id: 'vm-01', inference_engine: 'rust' })
  assert.equal(kind.kind, 'claude')
  assert.equal(kind.platform, 'anthropic')
  assert.equal(isCodexVm({ inference_engine: 'rust' }), false)
})

test('explicit openai/codex wins over missing flags', () => {
  const kind = normalizeVmKind({ platform: 'openai', family: 'codex' })
  assert.equal(kind.kind, 'codex')
  assert.equal(isCodexVm({ platform: 'openai' }), true)
})

test('explicit anthropic ignores leftover Codex flags', () => {
  const vm = { platform: 'anthropic', family: 'claude', codex_kernel: true, inference_engine: 'codex' }
  assert.equal(isCodexVm(vm), false)
  assert.equal(normalizeVmKind(vm).kind, 'claude')
})

test('legacy unmarked Codex flags still classify as Codex', () => {
  assert.equal(isCodexVm({ codex_kernel: true }), true)
  assert.equal(isCodexVm({ inference_engine: 'codex' }), true)
  assert.equal(isCodexVm({ runtime: { codex_kernel: '1' } }), true)
})

test('stamp writes platform and drops the other credential bag', () => {
  const claude = { claude: { email: 'a@x' }, codex: { email: 'b@x' } }
  stampVmKind(claude, { platform: 'anthropic' })
  assert.equal(claude.platform, 'anthropic')
  assert.equal(claude.family, 'claude')
  assert.equal(claude.codex, undefined)
  assert.deepEqual(claude.claude, { email: 'a@x' })

  const codex = { claude: { email: 'a@x' } }
  stampVmKind(codex, { family: 'codex' })
  assert.equal(codex.platform, 'openai')
  assert.equal(codex.codex_kernel, true)
  assert.equal(codex.claude, undefined)
  assert.deepEqual(codex.codex, {})
})

test('summarizeVm does not mix Claude email onto a Codex slot', () => {
  const summary = summarizeVm({
    id: 'vm-codex-01',
    platform: 'openai',
    family: 'codex',
    claude: { email: 'claude@x', has_access: true },
  })
  assert.equal(summary.platform, 'openai')
  assert.equal(summary.family, 'codex')
  assert.equal(summary.email, null)
  assert.equal(summary.has_token, false)
})

test('Claude pool gate skips Codex VMs', () => {
  const gate = evaluateSlotGate({
    id: 'vm-codex-01',
    status: 'running',
    schedulable: true,
    platform: 'openai',
    proxy_cli_enabled: true,
    proxy: { url: 'socks5h://127.0.0.1:1080' },
    claude: { has_access: true },
  })
  assert.equal(gate.ok, false)
  assert.equal(gate.reason, 'codex_vm')
})

test('recreate keeps Codex kind and wipes Claude leftover', () => {
  const next = buildRecreatedVmRecord({
    id: 'vm-09',
    name: '09',
    platform: 'openai',
    family: 'codex',
    claude: { email: 'old@x', has_access: true },
  })
  assert.equal(next.platform, 'openai')
  assert.equal(next.family, 'codex')
  assert.equal(next.claude, undefined)
  assert.deepEqual(next.codex, {})
})
