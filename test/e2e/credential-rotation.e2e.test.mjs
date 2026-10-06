import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import {
  dispatchCallInference,
  dispatchStreamInference,
  clearRustHealthCache,
} from '../../src/lib/transport/kernel-router.mjs'
import { callRustKernel, streamRustKernel, rustKernelHealth } from '../../src/lib/transport/rust-kernel-client.mjs'

const root = path.resolve(import.meta.dirname, '../..')
const kernelBin = path.join(root, 'bin/kin-kernel')
const cliBin = path.join(root, 'share/wrap-cli/cli-node')

async function fixture(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kin-rotation-'))
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }))
  const homeDir = path.join(temp, 'cli-home')
  const claudeDir = path.join(homeDir, '.claude')
  fs.mkdirSync(claudeDir, { recursive: true })
  const credentialPath = path.join(claudeDir, 'credentials.json')
  function rotate(token, expiresAt = Date.now() + 3_600_000) {
    fs.writeFileSync(
      credentialPath + '.tmp',
      JSON.stringify({
        claudeAiOauth: {
          accessToken: token,
          refreshToken: 'fixture-refresh-token',
          expiresAt,
          scopes: ['user:inference', 'user:profile'],
          subscriptionType: 'pro',
        },
      }),
      { mode: 0o600 },
    )
    fs.renameSync(credentialPath + '.tmp', credentialPath)
  }
  rotate('fixture-old-token')
  fs.symlinkSync('credentials.json', path.join(claudeDir, '.credentials.json'))
  const captured = []
  let finishLong
  const upstream = http.createServer(async (req, res) => {
    let raw = ''
    for await (const chunk of req) raw += chunk
    if (!req.url.startsWith('/v1/messages')) return res.writeHead(404).end()
    const body = JSON.parse(raw)
    const marker = ['long-stream', 'after-touch', 'after-rotation', 'reject-once', 'expired-on-disk'].find((value) =>
      JSON.stringify(body.messages).includes(value),
    )
    captured.push({ marker, auth: req.headers.authorization })
    if (marker === 'reject-once' && req.headers.authorization === 'Bearer fixture-new-token') {
      res.writeHead(401, { 'content-type': 'application/json' })
      return res.end(
        JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'OAuth token has expired' } }),
      )
    }
    const emit = (event) => res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    emit({
      type: 'message_start',
      message: {
        id: 'msg_rotation',
        type: 'message',
        role: 'assistant',
        model: body.model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 0 },
      },
    })
    emit({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })
    emit({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'pong' } })
    const finish = () => {
      emit({ type: 'content_block_stop', index: 0 })
      emit({
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { output_tokens: 1 },
      })
      emit({ type: 'message_stop' })
      res.end()
    }
    if (marker === 'long-stream') finishLong = finish
    else finish()
  })
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve))
  t.after(async () => {
    upstream.closeAllConnections()
    await new Promise((resolve) => upstream.close(resolve))
  })
  const socketPath = path.join(temp, 'kernel.sock')
  const tokenPath = path.join(temp, 'internal.token')
  const configPath = path.join(temp, 'kernel.json')
  fs.writeFileSync(tokenPath, 'fixture-internal')
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      vm_id: 'vm-rotation',
      socket_path: socketPath,
      credential_path: credentialPath,
      internal_token: 'fixture-internal',
      provider: 'local_cli',
      claude_bin: cliBin,
      slots_per_worker: 20,
      test_endpoints: true,
      anthropic_base_url: `http://127.0.0.1:${upstream.address().port}`,
    }),
  )
  const env = {
    ...process.env,
    CLAUDE_CONFIG_DIR: claudeDir,
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${upstream.address().port}`,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    DISABLE_TELEMETRY: '1',
    DISABLE_ERROR_REPORTING: '1',
    NO_PROXY: '127.0.0.1,localhost',
    KIN_ENVELOPE_PATH: path.join(temp, 'no-envelope.json'),
  }
  for (const key of [
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'ALL_PROXY',
    'http_proxy',
    'https_proxy',
    'all_proxy',
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_AUTH_TOKEN',
    'CLAUDE_CODE_OAUTH_TOKEN',
    'KIN_SOCKS5',
    'KIN_HTTPS_PROXY',
    'KIN_CLAUDE_AI_OAUTH_JSON',
    'KIN_CLAUDE_CODE_OAUTH_TOKEN',
  ])
    delete env[key]
  const kernel = spawn(kernelBin, ['--gateway-worker', '--config', configPath], {
    cwd: temp,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const closed = once(kernel, 'close')
  let log = ''
  kernel.stdout.on('data', (chunk) => {
    log += chunk
  })
  kernel.stderr.on('data', (chunk) => {
    log += chunk
  })
  t.after(async () => {
    kernel.kill('SIGKILL')
    await closed
  })
  const exec = {
    vmId: 'vm-rotation',
    homeDir,
    vm: {
      id: 'vm-rotation',
      runtime: { kernel_socket: socketPath, worker_token_file: tokenPath, worker_run_dir: temp },
    },
  }
  let health
  for (let i = 0; i < 100 && kernel.exitCode == null; i++) {
    health = await rustKernelHealth(exec, { timeoutMs: 200 })
    if (health?.ready_slots > 0) break
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  assert.ok(health?.ready_slots > 0, log.slice(-2000))
  // Make the issue's >500ms comparison deterministic without delaying the test.
  const old = new Date(Date.now() - 60_000)
  fs.utimesSync(credentialPath, old, old)
  fs.utimesSync(socketPath, old, old)
  const socketMtime = fs.statSync(socketPath).mtimeMs
  const previous = { KIN_KERNEL_BIN: process.env.KIN_KERNEL_BIN, KIN_DOCKER_BIN: process.env.KIN_DOCKER_BIN }
  process.env.KIN_KERNEL_BIN = kernelBin
  // A regression must fail locally instead of issuing commands to a real Docker daemon.
  process.env.KIN_DOCKER_BIN = '/bin/false'
  clearRustHealthCache(exec.vmId)
  t.after(() => {
    clearRustHealthCache(exec.vmId)
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
  return {
    exec,
    kernel,
    health,
    rotate,
    captured,
    credentialPath,
    socketPath,
    socketMtime,
    finishLong: () => finishLong(),
  }
}

for (const throughRouter of [false, true]) {
  test(`OAuth rotation preserves a live stream through ${throughRouter ? 'the router' : 'the existing kernel/CLI binaries'}`, {
    timeout: 20000,
  }, async (t) => {
    const fx = await fixture(t)
    const call = throughRouter ? dispatchCallInference : callRustKernel
    const stream = throughRouter ? dispatchStreamInference : streamRustKernel
    const request = (marker) => ({
      exec: fx.exec,
      timeoutMs: 5000,
      cliHop: true,
      body: { model: 'claude-haiku-4-5', max_tokens: 16, stream: true, messages: [{ role: 'user', content: marker }] },
    })
    let started
    const firstDelta = new Promise((resolve) => {
      started = resolve
    })
    const abort = new AbortController()
    const lines = []
    let longFinished = false
    const long = stream({
      ...request('long-stream'),
      signal: abort.signal,
      onEvent: (line) => {
        lines.push(line)
        if (line.includes('text_delta')) started()
      },
    }).finally(() => {
      longFinished = true
    })
    t.after(async () => {
      abort.abort()
      await long
    })
    await Promise.race([
      firstDelta,
      long.then((result) => {
        throw new Error(`long stream ended before its first delta: ${JSON.stringify(result)}`)
      }),
    ])
    fs.utimesSync(fx.credentialPath, new Date(), new Date())
    const touched = await call(request('after-touch'))
    assert.equal(touched.ok, true, JSON.stringify(touched))
    assert.equal(longFinished, false)
    fx.rotate('fixture-new-token')
    const rotated = await call(request('after-rotation'))
    assert.equal(rotated.ok, true, JSON.stringify(rotated))
    assert.equal(fx.captured.find((r) => r.marker === 'after-rotation').auth, 'Bearer fixture-new-token')
    assert.equal(longFinished, false)
    if (throughRouter) {
      let ensures = 0
      const ensureCredential = async (_exec, { force }) => {
        assert.equal(force, true)
        fx.rotate(++ensures === 1 ? 'fixture-recovered-token' : 'fixture-fresh-token')
        return { ok: true }
      }
      const recovered = await call({ ...request('reject-once'), ensureCredential })
      assert.equal(recovered.ok, true, JSON.stringify(recovered))
      assert.equal(recovered.credential_retried, true)
      assert.deepEqual(
        fx.captured.filter((r) => r.marker === 'reject-once').map((r) => r.auth),
        ['Bearer fixture-new-token', 'Bearer fixture-recovered-token'],
      )
      fx.rotate('fixture-expired-token', Date.now() - 1000)
      const refreshed = await call({ ...request('expired-on-disk'), ensureCredential })
      assert.equal(refreshed.ok, true, JSON.stringify(refreshed))
      assert.equal(refreshed.credential_retried, true)
      assert.equal(ensures, 2)
      assert.equal(fx.captured.find((r) => r.marker === 'expired-on-disk').auth, 'Bearer fixture-fresh-token')
      assert.equal(longFinished, false)
    }
    assert.equal(fx.captured.find((r) => r.marker === 'long-stream').auth, 'Bearer fixture-old-token')
    const health = await rustKernelHealth(fx.exec)
    assert.equal(health.cli_pid, fx.health.cli_pid)
    assert.equal(health.cli_restarts, fx.health.cli_restarts)
    assert.equal(fs.statSync(fx.socketPath).mtimeMs, fx.socketMtime)
    assert.equal(fx.kernel.exitCode, null)
    fx.finishLong()
    const completed = await long
    assert.equal(completed.ok, true, JSON.stringify(completed))
    assert.equal(completed.terminalState, 'verified')
    assert.ok(lines.includes('event: message_stop'))
    assert.equal(
      lines.some((line) => line === 'event: error'),
      false,
    )
  })
}
