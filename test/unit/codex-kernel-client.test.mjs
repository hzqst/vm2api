import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { codexKernelPaths, withCodexKernelExec } from '../../src/lib/transport/codex-kernel-client.mjs'
import {
  ensureCodexKernel,
  stopCodexKernel,
  writeCodexKernelConfig,
} from '../../src/lib/transport/codex-kernel-supervisor.mjs'
import fs from 'node:fs'
import os from 'node:os'

const PROXY_ENV_KEYS = [
  'HTTPS_PROXY',
  'https_proxy',
  'HTTP_PROXY',
  'http_proxy',
  'ALL_PROXY',
  'all_proxy',
  'NO_PROXY',
  'no_proxy',
]
const LOCAL_CODEX = {
  id: 'vm-codex',
  platform: 'openai',
  proxy: { id: 'px-local', scheme: 'local', host: 'local', port: 0 },
}

function setEnv(t, values) {
  const keys = [...new Set([...PROXY_ENV_KEYS, ...Object.keys(values)])]
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]))
  for (const k of PROXY_ENV_KEYS) delete process.env[k]
  Object.assign(process.env, values)
  t.after(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })
}
test('codex kernel socket is not worker.sock', () => {
  const exec = {
    homeDir: '/tmp/vms/vm-codex/cli-home',
    vm: { id: 'vm-codex', runtime: {} },
  }
  const paths = codexKernelPaths(exec)
  assert.equal(paths.socketPath, path.join('/tmp/vms/vm-codex/run', 'codex-kernel.sock'))
  const remapped = withCodexKernelExec(exec)
  assert.match(remapped.vm.runtime.worker_socket, /codex-kernel\.sock$/)
})

test('writeCodexKernelConfig writes bound SOCKS proxy', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kin-codex-'))
  const vm = { id: 'vm-codex', proxy: { url: 'socks5://127.0.0.1:1080' } }
  const written = writeCodexKernelConfig(root, vm, {
    token: 'secret',
    proxyUrl: 'socks5h://127.0.0.1:1080',
    proxyRequired: true,
  })
  const cfg = JSON.parse(fs.readFileSync(written.configPath, 'utf8'))
  assert.equal(cfg.proxy_required, true)
  assert.equal(cfg.proxy_url, 'socks5h://127.0.0.1:1080')
  assert.equal(cfg.socket_path, written.socketPath)
  assert.equal(cfg.internal_token, 'secret')
  assert.equal(cfg.max_request_bytes, 32 * 1024 * 1024)
  fs.rmSync(root, { recursive: true, force: true })
})

test('writeCodexKernelConfig fail-closes proxy_required without a URL', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kin-codex-'))
  const written = writeCodexKernelConfig(
    root,
    { id: 'vm-codex' },
    { token: 'secret', proxyUrl: '', proxyRequired: true },
  )
  const cfg = JSON.parse(fs.readFileSync(written.configPath, 'utf8'))
  assert.equal(cfg.proxy_required, true)
  assert.equal(cfg.proxy_url, '')
  fs.rmSync(root, { recursive: true, force: true })
})

test('local egress without a deployment proxy is a direct exit', (t) => {
  setEnv(t, {})
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kin-codex-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const written = writeCodexKernelConfig(root, LOCAL_CODEX, {
    token: 'secret',
    proxyUrl: 'socks5h://127.0.0.1:1080',
    proxyRequired: true,
  })
  const cfg = JSON.parse(fs.readFileSync(written.configPath, 'utf8'))
  assert.equal(cfg.proxy_required, false)
  assert.equal(cfg.proxy_url, '')
})

test('local egress hands the kernel the deployment proxy and fails closed on it', (t) => {
  setEnv(t, { HTTPS_PROXY: 'http://proxy.test:8443', HTTP_PROXY: 'http://other.test:3128' })
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kin-codex-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const written = writeCodexKernelConfig(root, LOCAL_CODEX, { token: 'secret', proxyUrl: '', proxyRequired: false })
  const cfg = JSON.parse(fs.readFileSync(written.configPath, 'utf8'))
  assert.equal(cfg.proxy_url, 'http://proxy.test:8443')
  assert.equal(cfg.proxy_required, true)
})

test('codex kernel starts without inherited proxy variables', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kin-codex-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const out = path.join(root, 'env.txt')
  const bin = path.join(root, 'fake-kernel')
  fs.writeFileSync(bin, `#!/bin/sh\nenv > "${out}.tmp" && mv "${out}.tmp" "${out}"\n`, { mode: 0o755 })
  setEnv(t, { HTTPS_PROXY: 'http://proxy.test:8443', no_proxy: 'chatgpt.com', KIN_CODEX_KERNEL_BIN: bin })
  const exec = {
    vmId: 'vm-codex',
    homeDir: path.join(root, 'vm-codex', 'cli-home'),
    vm: { id: 'vm-codex', runtime: {} },
  }
  t.after(() => stopCodexKernel('vm-codex'))
  await ensureCodexKernel(exec, { timeoutMs: 300 })
  for (let i = 0; i < 40 && !fs.existsSync(out); i++) await new Promise((r) => setTimeout(r, 50))
  const keys = fs
    .readFileSync(out, 'utf8')
    .split('\n')
    .map((line) => line.split('=')[0])
  assert.ok(keys.includes('KIN_CODEX_KERNEL_BIN'))
  assert.deepEqual(
    keys.filter((k) => /_proxy$/i.test(k)),
    [],
  )
})
