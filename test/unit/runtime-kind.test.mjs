import test from 'node:test'
import assert from 'node:assert/strict'
import { runtimeKind, isKvmRuntime, RUNTIME_DOCKER, RUNTIME_KVM } from '../../src/lib/vm/runtime-kind.mjs'
import { reloadSlot } from '../../src/lib/vm/slot-runtime.mjs'

test('runtimeKind defaults to docker', () => {
  assert.equal(runtimeKind({}), RUNTIME_DOCKER)
  assert.equal(runtimeKind({ runtime: { type: 'docker' } }), RUNTIME_DOCKER)
  assert.equal(isKvmRuntime({}), false)
})

test('runtimeKind accepts kvm aliases', () => {
  assert.equal(runtimeKind({ runtime: { type: 'kvm' } }), RUNTIME_KVM)
  assert.equal(runtimeKind({ runtime_type: 'qemu' }), RUNTIME_KVM)
  assert.equal(isKvmRuntime({ runtime: { type: 'libvirt' } }), true)
})

test('kvm reload refuses without adapter', async () => {
  const out = await reloadSlot({ id: 'vm-99', runtime: { type: 'kvm' } }, '/tmp/kin')
  assert.equal(out.ok, false)
  assert.equal(out.code, 'kvm_not_configured')
})
