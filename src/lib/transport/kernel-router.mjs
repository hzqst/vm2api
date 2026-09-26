/**
 * Request-level inference hop router.
 * 公开仓只走 rust cli-hop（kernel → Claude Code）。Go HTTP 转发不再启用。
 * Credential import/ensure 仍可走 Go 客户端，但不参与推理 hop。
 */
import { clientCancelledResult, isClientCancelledResult } from '../core/errors.mjs'
import { ensureWorkerCredential } from './go-worker-client.mjs'
import { ensureOfficialCredentialLink, slotUidGidFromHomeDir } from '../oauth/oauth-credentials.mjs'
import {
  streamRustKernel,
  callRustKernel,
  rustKernelHealth,
  rustKernelReachable,
  rustKernelBusy,
  isNeedsRefreshResult,
} from './rust-kernel-client.mjs'
import {
  ensureRustKernel,
  kernelBinPath,
  scheduleWrapRecycle,
  awaitWrapRecycle,
  noteWrapHop,
  beginWrapHop,
  endWrapHop,
  wrapHopInflight,
  deferWrapRecycle,
  credentialsNewerThanKernel,
} from './rust-kernel-supervisor.mjs'

const rustHealthCache = new Map()
const DEFAULT_SLOT_WAIT_MS = 30_000
const DEFAULT_SLOT_POLL_MS = 200

export function rustHealthTtlMs(routing = {}) {
  const raw = routing?.inference?.health_ttl_ms
  if (raw == null || raw === '') return 2000
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return 2000
  return n
}

export function rustSlotWaitMs(routing = {}) {
  const raw = routing?.inference?.slot_wait_ms
  if (raw == null || raw === '') return DEFAULT_SLOT_WAIT_MS
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return DEFAULT_SLOT_WAIT_MS
  return n
}

/** Hop slot poll uses leftover wait-plan budget; never stacks a second independent 30s. */
export function resolveHopSlotWaitMs({ remainingBudgetMs, routing } = {}) {
  const configuredRaw = routing?.inference?.slot_wait_ms
  const hasConfigured = configuredRaw != null && configuredRaw !== ''
  const configured = hasConfigured ? rustSlotWaitMs(routing) : null
  const budget = Number(remainingBudgetMs)
  const hasBudget = remainingBudgetMs != null && remainingBudgetMs !== '' && Number.isFinite(budget)
  if (hasBudget) {
    if (budget <= 0) return 0
    if (configured != null) return Math.min(budget, configured)
    return budget
  }
  return rustSlotWaitMs(routing)
}

export function rustShouldWaitForSlot(health, inflight = 0) {
  return rustKernelBusy(health) || Number(inflight) > 0
}

export async function waitForReadySlot(exec, timeoutMs = DEFAULT_SLOT_WAIT_MS, pollMs = DEFAULT_SLOT_POLL_MS) {
  const parsed = Number(timeoutMs)
  const waitMs = Number.isFinite(parsed) ? Math.max(0, parsed) : DEFAULT_SLOT_WAIT_MS
  const deadline = Date.now() + waitMs
  const gap = Math.max(40, Number(pollMs) || DEFAULT_SLOT_POLL_MS)
  let last = await rustKernelHealth(exec, { timeoutMs: 400 })
  if (rustKernelReachable(last)) return { ok: true, reason: 'already_up', health: last }
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, gap))
    last = await rustKernelHealth(exec, { timeoutMs: 400 })
    if (rustKernelReachable(last)) return { ok: true, reason: 'slot_ready', health: last }
  }
  return { ok: false, reason: 'slot_busy', health: last, error: 'rust kernel has no free slot' }
}

export function clearRustHealthCache(vmId = null) {
  if (vmId) rustHealthCache.delete(String(vmId))
  else rustHealthCache.clear()
}

function cacheKey(exec) {
  return String(exec?.vmId || exec?.vm?.id || '')
}

export function rememberRustHealth(exec, ready) {
  const key = cacheKey(exec)
  if (!key || !ready?.ok) return
  rustHealthCache.set(key, { at: Date.now(), health: ready.health || null })
}

export function peekRustHealth(exec, ttlMs, now = Date.now()) {
  if (ttlMs <= 0) return null
  const key = cacheKey(exec)
  if (!key) return null
  const hit = rustHealthCache.get(key)
  if (!hit) return null
  if (now - hit.at > ttlMs) return null
  return hit
}

export function resolveHopEngine(_vm, _routing = {}, { rustReady = null, binPath = null } = {}) {
  const wanted = 'rust'
  const bin = binPath != null ? String(binPath).trim() : kernelBinPath()
  if (rustReady === true) {
    return { engine: 'rust', wanted, reason: 'configured_rust', fallback: false }
  }
  if (rustReady === false || !bin) {
    return {
      engine: 'rust',
      wanted,
      reason: rustReady === false ? 'rust_unhealthy' : 'bin_missing',
      fallback: false,
      blocked: true,
    }
  }
  return { engine: 'rust', wanted, reason: 'configured_rust', fallback: false }
}

/**
 * Only a hop that may have leaked a CLI slot is recycled. An upstream answer
 * the transport restored (429 limit, 529, 401, stream error) is a response,
 * not a dead slot — SIGKILLing the CLI there is how a layout mismatch loops.
 */
export function isDeadWrapHop(result) {
  if (!result) return false
  if (isClientCancelledResult(result)) return false
  if (result.transportError) return true
  const msg = String(result?.body?.error?.message || '')
  if (/connection error/i.test(msg)) return true
  if (result.streamError) return false
  const status = Number(result.status) || 0
  if (status === 429 || status === 529 || status === 401 || status === 403) return false
  // No visible output is not a leaked CLI. Recycling here SIGKILLs the
  // supervisor child, then the same-account retry dies on the restart.
  return false
}

/** Transport failure may have leaked a CLI slot. Release it now; do not wait out the recycle cooldown. */
function releaseLeakedSlots(exec, recycleWrap) {
  clearRustHealthCache(cacheKey(exec))
  if (typeof recycleWrap === 'function') {
    recycleWrap(exec)
    return
  }
  scheduleWrapRecycle(exec, { cooldownMs: 0 })
}

function recycleLeakedWrap(exec, recycleWrap) {
  if (wrapHopInflight(exec) > 0) {
    deferWrapRecycle(exec, (item) => releaseLeakedSlots(item, recycleWrap))
    return
  }
  releaseLeakedSlots(exec, recycleWrap)
}

function rustUnavailableResult(ready) {
  const slotBusy = ready?.reason === 'slot_busy'
  return {
    ok: false,
    status: slotBusy ? 503 : 0,
    via: 'rust-kernel',
    engine: 'rust',
    body: {
      type: 'error',
      error: {
        type: 'worker_error',
        code: ready?.reason || 'rust_unavailable',
        message: ready?.error || 'rust kernel is not available',
      },
    },
    headers: {},
    terminalState: slotBusy ? 'rejected' : 'transport_error',
    transportError: !slotBusy,
  }
}

function credentialEnsureFailure(result, ensured) {
  const rawError = ensured?.error
  const error = rawError && typeof rawError === 'object' ? rawError : {}
  const blob = `${error.code || ''} ${error.message || ''} ${typeof rawError === 'string' ? rawError : ''}`
  const fatal = /invalid_grant|oauth_revoked|token has been revoked|refresh_token_missing/i.test(blob)
  const revoked = /token has been revoked|oauth_revoked/i.test(blob)
  return {
    ...result,
    ok: false,
    status: fatal ? 401 : Number(ensured?.status) || result.status,
    committed: fatal ? false : result.committed,
    terminalState: fatal ? 'rejected' : result.terminalState,
    body: {
      type: 'error',
      error: {
        type: fatal ? 'authentication_error' : error.type || 'worker_error',
        code: fatal
          ? revoked
            ? 'oauth_revoked'
            : error.code || 'invalid_grant'
          : error.code || 'credential_refresh_failed',
        message: fatal
          ? revoked
            ? 'OAuth access token has been revoked'
            : 'OAuth credential was rejected'
          : String(error.message || rawError || 'credential ensure failed').slice(0, 300),
      },
    },
    credential_ensure_failed: true,
  }
}

async function prepareSlotCredentials(exec) {
  if (!exec?.homeDir) return
  const ids = slotUidGidFromHomeDir(exec.homeDir)
  ensureOfficialCredentialLink(exec.homeDir, ids || {})
}

async function bounceRustForFreshTicket(exec) {
  await prepareSlotCredentials(exec)
  await ensureWorkerCredential(exec)
  const rec = scheduleWrapRecycle(exec, { cooldownMs: 0 })
  if (rec.pending) await rec.pending
  clearRustHealthCache(cacheKey(exec))
  const started = await ensureRustKernel(exec)
  if (started?.ok) rememberRustHealth(exec, started)
  else clearRustHealthCache(cacheKey(exec))
  return started
}

async function prepareRust(exec, { ensure, routing, slotWaitMs } = {}) {
  await awaitWrapRecycle(exec)
  if (typeof ensure === 'function') return ensure(exec)
  await prepareSlotCredentials(exec)
  if (credentialsNewerThanKernel(exec)) {
    return bounceRustForFreshTicket(exec)
  }
  const ttl = rustHealthTtlMs(routing)
  const cached = peekRustHealth(exec, ttl)
  if (cached && rustKernelReachable(cached.health)) {
    return { ok: true, reason: 'health_cache', health: cached.health }
  }
  const health = await rustKernelHealth(exec, { timeoutMs: 800 })
  if (rustKernelReachable(health)) {
    const ready = { ok: true, reason: 'already_up', health }
    rememberRustHealth(exec, ready)
    return ready
  }
  if (rustShouldWaitForSlot(health, wrapHopInflight(exec))) {
    const waited = await waitForReadySlot(exec, resolveHopSlotWaitMs({ remainingBudgetMs: slotWaitMs, routing }))
    if (waited?.ok) {
      rememberRustHealth(exec, waited)
      return waited
    }
    return waited
  }
  if (exec?.homeDir) await ensureWorkerCredential(exec)
  const started = await ensureRustKernel(exec)
  if (started?.ok) rememberRustHealth(exec, started)
  else clearRustHealthCache(cacheKey(exec))
  return started
}

async function runHop({ mode, opts }) {
  const routing = opts.routing || {}
  const decision = resolveHopEngine(opts.exec?.vm, routing)
  let engine = 'rust'
  let reason = decision.reason
  if (!decision.blocked) {
    const ready = await prepareRust(opts.exec, {
      ensure: opts.ensureRust,
      routing,
      slotWaitMs: opts.slotWaitMs,
    })
    if (ready?.ok) {
      reason = ready.reason || 'configured_rust'
    } else {
      if (ready?.reason === 'slot_busy') releaseLeakedSlots(opts.exec, opts.recycleWrap)
      return {
        ...rustUnavailableResult(ready),
        wanted_engine: 'rust',
        engine_reason: ready?.reason || 'rust_unavailable',
      }
    }
  } else {
    return {
      ...rustUnavailableResult({ reason: decision.reason }),
      wanted_engine: 'rust',
      engine_reason: decision.reason,
    }
  }
  const send = mode === 'stream' ? streamRustKernel : callRustKernel
  beginWrapHop(opts.exec)
  let result
  try {
    result = await send(opts)
    noteWrapHop(opts.exec)
    if (opts.signal?.aborted || isClientCancelledResult(result)) {
      result = clientCancelledResult(result)
    } else if (result.transportError === true && result.committed !== true) {
      result = await send(opts)
      result = { ...result, rust_transport_retried: true }
      noteWrapHop(opts.exec)
    }
    if (!isClientCancelledResult(result) && isNeedsRefreshResult(result)) {
      const ensure = opts.ensureCredential || ensureWorkerCredential
      const ensured = await ensure(opts.exec, { force: true })
      if (ensured?.ok !== true) result = credentialEnsureFailure(result, ensured)
      else {
        const recycle = opts.recycleWrap || scheduleWrapRecycle
        recycle(opts.exec)
        await awaitWrapRecycle(opts.exec)
        result = await send(opts)
        result = { ...result, credential_retried: true }
        noteWrapHop(opts.exec)
      }
    }
    return {
      ...result,
      engine,
      wanted_engine: decision.wanted,
      engine_reason: reason,
    }
  } finally {
    endWrapHop(opts.exec)
    if (!opts.signal?.aborted && !isClientCancelledResult(result) && isDeadWrapHop(result)) {
      recycleLeakedWrap(opts.exec, opts.recycleWrap)
    }
  }
}

export function dispatchStreamInference(opts = {}) {
  return runHop({ mode: 'stream', opts })
}

export function dispatchCallInference(opts = {}) {
  return runHop({ mode: 'call', opts })
}
