import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { mergeGuestFingerprint, collectSlotIdentity } from '../../src/lib/vm/guest-identity.mjs'

test('merge keeps device/session and maps arch', () => {
  const out = mergeGuestFingerprint(
    { device_id: 'dev-keep', session_id: 'sess-keep', stainless_package_version: '0.94.0' },
    {
      hostname: '01',
      os_id: 'ubuntu',
      os_pretty: 'Ubuntu 24.04',
      kernel_release: '6.8.0-host',
      arch: 'amd64',
      goos: 'linux',
      runtime_kind: 'docker',
      worker_version: '2026.08.23-identity',
      collected_at: '2026-08-23T00:00:00Z',
    },
  )
  assert.equal(out.device_id, 'dev-keep')
  assert.equal(out.session_id, 'sess-keep')
  assert.equal(out.source, 'guest')
  assert.equal(out.stainless_os, 'Linux')
  assert.equal(out.stainless_arch, 'x64')
  assert.equal(out.hostname, '01')
  assert.equal(out.stainless_runtime_version, 'v26.3.0')
})

test('merge keeps official machine as device_id and parks guest machine', () => {
  const out = mergeGuestFingerprint(
    {
      official_machine_id: 'official-m',
      device_id: 'old-dev',
      machine_id: 'guest-m',
      session_id: 'sess-keep',
    },
    { hostname: '01', machine_id: 'guest-new', arch: 'amd64', goos: 'linux' },
  )
  assert.equal(out.device_id, 'official-m')
  assert.equal(out.official_machine_id, 'official-m')
  assert.equal(out.guest_machine_id, 'guest-new')
  assert.equal(out.identity_source, 'official-cc-init')
  assert.equal('machine_id' in out, false)
})

test('collectSlotIdentity writes guest fingerprint onto vm.json', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kin-guest-'))
  const id = 'vm-01'
  fs.mkdirSync(path.join(root, 'vms', id), { recursive: true })
  const vmPath = path.join(root, 'vms', `${id}.json`)
  fs.writeFileSync(
    vmPath,
    JSON.stringify({
      id,
      fingerprint: { device_id: 'dev-1', session_id: 'sess-1' },
      runtime: { type: 'docker' },
    }),
  )
  const out = await collectSlotIdentity(
    root,
    { id, runtime: { type: 'docker' } },
    {
      callGet: async () => ({
        ok: true,
        status: 200,
        body: {
          ok: true,
          identity: {
            hostname: '01',
            os_pretty: 'Ubuntu 24.04',
            arch: 'amd64',
            goos: 'linux',
            runtime_kind: 'docker',
            worker_version: 'test',
            collected_at: '2026-08-23T01:00:00Z',
          },
        },
      }),
    },
  )
  assert.equal(out.ok, true)
  const saved = JSON.parse(fs.readFileSync(vmPath, 'utf8'))
  assert.equal(saved.fingerprint.device_id, 'dev-1')
  assert.equal(saved.fingerprint.hostname, '01')
  assert.equal(saved.fingerprint.source, 'guest')
  assert.equal(saved.runtime.identity_collected_at, '2026-08-23T01:00:00Z')
  fs.rmSync(root, { recursive: true, force: true })
})

test('collectSlotIdentity maps missing endpoint', async () => {
  const out = await collectSlotIdentity(
    '/tmp',
    { id: 'vm-01' },
    {
      callGet: async () => ({ ok: false, status: 404, body: { error: { message: 'not found' } } }),
    },
  )
  assert.equal(out.ok, false)
  assert.equal(out.code, 'worker_identity_unsupported')
})

test('merge keeps generated hostname and catalog kernel', () => {
  const out = mergeGuestFingerprint(
    {
      device_id: 'ab'.repeat(32),
      session_id: 'sess-keep',
      hostname: 'ubuntu-a3f1',
      linux_kernel: '6.8.0-51-generic',
      guest_machine_id: 'cd'.repeat(16),
      source: 'generated',
      timezone: 'America/Denver',
      locale: 'en_US.UTF-8',
    },
    {
      hostname: '05',
      kernel_release: '7.0.0-14-generic',
      machine_id: 'guest-new',
      timezone: 'UTC',
      locale: 'C',
      arch: 'amd64',
      goos: 'linux',
    },
  )
  assert.equal(out.hostname, 'ubuntu-a3f1')
  assert.equal(out.guest_hostname, '05')
  assert.equal(out.kernel_release, '6.8.0-51-generic')
  assert.equal(out.guest_kernel_release, '7.0.0-14-generic')
  assert.equal(out.guest_machine_id, 'cd'.repeat(16))
  assert.equal(out.timezone, 'America/Denver')
  assert.equal(out.locale, 'en_US.UTF-8')
  assert.equal(out.source, 'generated')
  assert.equal(out.device_id, 'ab'.repeat(32))
})
