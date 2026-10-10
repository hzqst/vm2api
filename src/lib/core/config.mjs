import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { hashKey } from './security.mjs'
import { atomicWriteJson } from '../vm/vm-file.mjs'
import { loadDistillRules } from './distill-detect.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// this file lives at src/lib/core/ — the gateway root is src/
const ROOT = path.resolve(__dirname, '..', '..')
const PROJECT = path.resolve(process.env.KIN_PROJECT_ROOT || path.resolve(ROOT, '..'))

const STREAM_IDLE_TIMEOUT_MIN_MS = 30_000
const STREAM_IDLE_TIMEOUT_MAX_MS = 3_600_000

/**
 * Max silence on an upstream stream, shared by the gateway and the slot kernel.
 * Without eager_input_streaming, upstream buffers a large tool input (a long
 * Write content) and stays silent for minutes; eager_tool_streaming avoids that.
 * The panel value (routing failover.stream_idle_timeout_ms) wins over the fallback.
 */
export function streamIdleTimeoutMs(routing, fallbackMs = Number(process.env.KIN_STREAM_IDLE_TIMEOUT) || 180_000) {
  const ms = Number(routing?.failover?.stream_idle_timeout_ms)
  if (!Number.isFinite(ms) || ms <= 0) return fallbackMs
  return Math.min(STREAM_IDLE_TIMEOUT_MAX_MS, Math.max(STREAM_IDLE_TIMEOUT_MIN_MS, Math.round(ms)))
}

/** Live routing.json. KIN_ROUTING_FILE wins; otherwise <project>/src/config/routing.json. */
export function routingConfigFile(projectRoot = PROJECT) {
  const override = String(process.env.KIN_ROUTING_FILE || '').trim()
  if (override) return override
  return path.join(projectRoot || PROJECT, 'src', 'config', 'routing.json')
}

export function readRoutingConfigFile(projectRoot = PROJECT) {
  const file = routingConfigFile(projectRoot)
  let raw
  try {
    raw = fs.readFileSync(file, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error(`Routing config '${file}' not found`, { cause: error })
    throw new Error(`Routing config '${file}' unreadable: ${error?.message || error}`, { cause: error })
  }
  try {
    return JSON.parse(raw)
  } catch (error) {
    throw new Error(`Routing config '${file}' has invalid JSON: ${error?.message || error}`, { cause: error })
  }
}

export function loadConfig() {
  const keyFile = path.join(ROOT, 'config', 'test.key')
  const apiKey =
    process.env.VM2API_API_KEY ||
    process.env.KIN_API_KEY ||
    (fs.existsSync(keyFile) ? fs.readFileSync(keyFile, 'utf8').trim() : null)
  if (!apiKey) throw new Error('VM2API_API_KEY not set')

  const active = JSON.parse(fs.readFileSync(path.join(PROJECT, 'vms', 'active.json'), 'utf8'))
  const vm = JSON.parse(fs.readFileSync(path.join(PROJECT, 'vms', `${active.active_vm}.json`), 'utf8'))

  const port = Number(process.env.PORT || 8787)
  const host = process.env.HOST || '0.0.0.0'
  const publicHost = process.env.PUBLIC_HOST || process.env.HOST || '127.0.0.1'

  const cfg = {
    port,
    host,
    public_host: publicHost,
    base_url:
      process.env.PUBLIC_BASE_URL ||
      `${process.env.PUBLIC_SCHEME || 'http'}://${publicHost}${String(process.env.PUBLIC_SCHEME || 'http') === 'https' ? '' : ':' + port}`,
    api_key: apiKey,
    api_key_hash: hashKey(apiKey),
    // rewrite pipeline — DEFAULT OFF (passthrough preferred)
    rewrite: {
      enabled: process.env.KIN_REWRITE === '1' || process.env.KIN_REWRITE === 'true',
      model_map: false, // aliases disabled — official Claude names only
    },
    intercept: {
      // empty rules = no-op; rules can be loaded from config/intercept-rules.json
      rules: loadInterceptRules(path.join(ROOT, 'config', 'intercept-rules.json')),
    },
    distill: loadDistillRules(path.join(ROOT, 'config', 'distill-rules.json')),
    limits: {
      max_body_bytes: Number(process.env.KIN_MAX_BODY || 128 * 1024 * 1024),
      // First-byte wait for worker HTTP headers. Matches sub2api
      // gateway.response_header_timeout (600s). Idle is stream_idle_timeout_ms.
      upstream_timeout_ms: Number(process.env.KIN_UPSTREAM_TIMEOUT || 600000),
      stream_idle_timeout_ms: streamIdleTimeoutMs(),
      stream_keepalive_ms: Number(process.env.KIN_STREAM_KEEPALIVE || 10000),
      rate_capacity: Number(process.env.KIN_RATE_CAP || 60),
      rate_refill: Number(process.env.KIN_RATE_REFILL || 1),
    },
    // Admin/status snapshot of the *active* VM only.
    // Inference must use buildExecutionContext() — never this object.
    vm: {
      id: vm.id,
      name: vm.name,
      email: vm.claude?.email,
      account_uuid: vm.claude?.account_uuid || vm.id,
      org_uuid: vm.claude?.org_uuid || null,
      has_access: !!(vm.claude?.has_access || vm.claude?.access_token),
      proxy: vm.proxy || null,
      has_refresh: !!(vm.claude?.has_refresh || vm.claude?.refresh_token),
      expires_at: vm.claude?.expires_at,
      refresh_error: vm.claude?.refresh_error || null,
      max_concurrency: vm.policy?.maxConcurrency || 2,
      claude_code_version: vm.claude_code_version || 'unknown',
      timezone: vm.timezone || 'UTC',
      locale: vm.locale || 'en_US.UTF-8',
      kernel: vm.kernel || null,
      seed_policy: vm.seed_policy || null,
      path: path.join(PROJECT, 'vms', `${vm.id}.json`),
    },
    paths: {
      root: ROOT,
      project: PROJECT,
      captures: process.env.KIN_CAPTURES_DIR || path.join(ROOT, 'captures'),
      data: process.env.KIN_DATA_DIR || path.join(ROOT, 'data'),
    },
  }
  return cfg
}

function loadInterceptRules(file) {
  try {
    if (!fs.existsSync(file)) return []
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    return Array.isArray(data) ? data : data.rules || []
  } catch {
    return []
  }
}

export function hydrateVmCfg(cfg, vm, projectRoot = cfg.paths?.project) {
  if (!cfg || !vm) return cfg
  const root = projectRoot || path.dirname(path.dirname(cfg.vm?.path || ''))
  cfg.vm = {
    id: vm.id,
    name: vm.name,
    email: vm.claude?.email,
    account_uuid: vm.claude?.account_uuid || vm.id,
    org_uuid: vm.claude?.org_uuid || null,
    has_access: !!(vm.claude?.has_access || vm.claude?.access_token),
    proxy: vm.proxy || null,
    has_refresh: !!(vm.claude?.has_refresh || vm.claude?.refresh_token),
    expires_at: vm.claude?.expires_at,
    refresh_error: vm.claude?.refresh_error || null,
    max_concurrency: vm.policy?.maxConcurrency || 2,
    claude_code_version: vm.claude_code_version || 'unknown',
    timezone: vm.timezone || 'UTC',
    locale: vm.locale || 'en_US.UTF-8',
    kernel: vm.kernel || null,
    seed_policy: vm.seed_policy || null,
    path: path.join(root, 'vms', `${vm.id}.json`),
  }
  return cfg
}

export function reloadActiveVm(cfg) {
  const project = cfg.paths.project
  const id = JSON.parse(fs.readFileSync(path.join(project, 'vms', 'active.json'), 'utf8')).active_vm
  const vm = JSON.parse(fs.readFileSync(path.join(project, 'vms', `${id}.json`), 'utf8'))
  return hydrateVmCfg(cfg, vm, project)
}

export function saveVmPatch(vmPath, patch) {
  const vm = JSON.parse(fs.readFileSync(vmPath, 'utf8'))
  Object.assign(vm, patch)
  if (patch.claude_code_version) {
    vm.claude_code_version = patch.claude_code_version
    vm.claude_code_updated_at = new Date().toISOString()
  }
  atomicWriteJson(vmPath, vm, { mode: 0o600 })
  return vm
}
