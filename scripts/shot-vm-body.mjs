#!/usr/bin/env node
/**
 * Single-shot VM body probe against the current default rewrite envelope.
 *
 * Start from the live unofficial rewrite body:
 *   billing + identity + KIN short agent (5m) + official continuation/env (5m).
 * Caller leftover is appended last only when inbound system is non-official.
 * Overlay may park onto the first user. Then mutate only system:
 *   [0] billing header LINE + official identity sentence
 *   [1] caller leftover system — omit the block when empty
 *   then the same KIN agent + slot Environment blocks (text + cache kept)
 *
 * Headers / thinking / session / tools / cache stay from prepareOutboundEnvelope.
 * Production /v1 rewrite is not changed. Go worker JSON-passthroughs the body.
 *
 *   node scripts/shot-vm-body.mjs --vm vm-13 --dump
 *   node scripts/shot-vm-body.mjs --vm vm-13 --dump --system "调用方 system"
 *   node scripts/shot-vm-body.mjs --vm vm-13 --compare
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getVm } from '../src/lib/vm/vm-registry.mjs'
import { slotExec } from '../src/lib/vm/slot-runtime.mjs'
import { buildVmTestInbound, slotTestIdentity } from '../src/lib/admin/vm-test-chat.mjs'
import { prepareOutboundEnvelope } from '../src/lib/protocol/outbound-attempt.mjs'
import {
  CRS_AGENT_EXPANSION,
  CRS_OFFICIAL_SYSTEM,
  applyCrsUnofficialPersona,
  collectCallerSystemAppend,
  mergeIdentityIntoBilling,
} from '../src/lib/identity/crs-persona.mjs'
import { officialSystemKinds } from '../src/lib/protocol/case-features.mjs'
import { readSlotCredentialIdentity } from '../src/lib/oauth/oauth-credentials.mjs'
import { streamGoWorker, workerPaths } from '../src/lib/transport/go-worker-client.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_ROOT = fs.existsSync('/opt/kin-gateway/src/server.mjs') ? '/opt/kin-gateway' : path.resolve(HERE, '..')
const DEFAULT_MODEL = 'claude-sonnet-5'
const DEFAULT_PROMPT = 'hello'
const DEFAULT_MAX_TOKENS = 2048
const DEFAULT_VM = 'vm-13'
const IDENTITY_LINE = CRS_OFFICIAL_SYSTEM
const GO_HEADER_ALLOW = new Set([
  'accept',
  'accept-language',
  'anthropic-beta',
  'anthropic-dangerous-direct-browser-access',
  'anthropic-version',
  'content-type',
  'user-agent',
  'x-app',
  'x-claude-code-session-id',
  'x-client-request-id',
  'x-stainless-arch',
  'x-stainless-helper-method',
  'x-stainless-lang',
  'x-stainless-os',
  'x-stainless-package-version',
  'x-stainless-retry-count',
  'x-stainless-runtime',
  'x-stainless-runtime-version',
  'x-stainless-timeout',
])

function arg(name, fallback = '') {
  const i = process.argv.indexOf(name)
  if (i < 0) return fallback
  const next = process.argv[i + 1]
  if (!next || next.startsWith('--')) return true
  return next
}

function isOfficialAgentText(text = '') {
  const t = String(text || '')
  if (!t.trim()) return false
  if (t.includes('# Doing tasks') && t.includes('# Tone and style')) return true
  if (t.trim() === CRS_AGENT_EXPANSION.trim()) return true
  return t.includes('Help the user complete the current request.') && t.includes('# Tone and style')
}

function classifyBlock(text = '') {
  const t = String(text || '')
  if (/x-anthropic-billing-header:/i.test(t) && t.includes(IDENTITY_LINE)) return 'billing+identity'
  if (/^\s*x-anthropic-billing-header:/i.test(t)) return 'billing'
  if (t.trim() === IDENTITY_LINE) return 'identity'
  if (isOfficialAgentText(t)) return 'agent_prompt'
  if (t.includes('# Environment')) return 'environment'
  if (t.trim()) return 'caller'
  return 'other'
}

export { mergeIdentityIntoBilling }

export function applyDefaultForwardMutations(system, leftover = '') {
  const merged = mergeIdentityIntoBilling(system)
  if (!Array.isArray(merged)) return merged
  const billing = merged.find((block) => /x-anthropic-billing-header:/i.test(String(block?.text || '')))
  const agent = merged.find((block) => classifyBlock(block?.text) === 'agent_prompt')
  const env = merged.find((block) => classifyBlock(block?.text) === 'environment')
  let caller = String(leftover || '').trim()
  if (
    !caller ||
    caller === IDENTITY_LINE ||
    /x-anthropic-billing-header:/i.test(caller) ||
    isOfficialAgentText(caller)
  ) {
    caller = ''
  }
  const out = []
  if (billing) out.push(billing)
  if (caller) out.push({ type: 'text', text: caller })
  if (agent) out.push({ ...agent })
  if (env) out.push({ ...env })
  return out
}

function readCallerSystemArg() {
  const file = arg('--system-file', '')
  if (file && file !== true) return fs.readFileSync(String(file), 'utf8')
  const text = arg('--system', '')
  if (text && text !== true) return String(text)
  const alias = arg('--caller', '')
  if (alias && alias !== true) return String(alias)
  return ''
}

function redactUserId(raw) {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!parsed || typeof parsed !== 'object') return { present: !!raw }
    return {
      device_id: parsed.device_id ? `${String(parsed.device_id).slice(0, 8)}…` : '',
      account_uuid: parsed.account_uuid ? `${String(parsed.account_uuid).slice(0, 8)}…` : '',
      session_id: parsed.session_id || '',
      keys: Object.keys(parsed),
    }
  } catch {
    return { present: !!raw }
  }
}

function goForwardHeaders(headers = {}) {
  const out = {}
  for (const [key, value] of Object.entries(headers || {})) {
    const name = String(key).toLowerCase()
    if (!GO_HEADER_ALLOW.has(name) || value == null || value === '') continue
    out[name] = value
  }
  return out
}

function summarizeSystem(system) {
  if (!Array.isArray(system)) return { shape: typeof system, text_chars: String(system || '').length }
  return system.map((block, i) => {
    const text = String(block?.text || '')
    return {
      i,
      kind: classifyBlock(text),
      chars: text.length,
      cache_control: block?.cache_control || null,
      first_line: text.split('\n')[0].slice(0, 180),
      has_identity_line: text.includes(IDENTITY_LINE),
    }
  })
}

function featureFingerprint(body, headers) {
  const system = Array.isArray(body?.system) ? body.system : []
  return {
    model: body?.model || null,
    max_tokens: body?.max_tokens ?? null,
    stream: body?.stream ?? null,
    temperature: body?.temperature ?? null,
    thinking: body?.thinking ?? null,
    output_config: body?.output_config ?? null,
    context_management: body?.context_management ?? null,
    tools_count: Array.isArray(body?.tools) ? body.tools.length : null,
    tool_names: Array.isArray(body?.tools) ? body.tools.map((t) => t?.name).filter(Boolean) : [],
    metadata_keys: redactUserId(body?.metadata?.user_id).keys || [],
    system_count: system.length,
    system_kinds: officialSystemKinds(system),
    cache: system.map((block) => block?.cache_control || null),
    agent_chars: system.find((block) => classifyBlock(block?.text) === 'agent_prompt')?.text?.length || 0,
    env_chars: system.find((block) => String(block?.text || '').includes('# Environment'))?.text?.length || 0,
    go_headers: goForwardHeaders(headers),
  }
}

function featureDiff(before, after) {
  const ignore = new Set(['system_count', 'system_kinds', 'cache'])
  const changed = []
  const same = []
  for (const key of Object.keys(before || {})) {
    const a = JSON.stringify(before[key])
    const b = JSON.stringify(after[key])
    if (a === b) same.push(key)
    else if (!ignore.has(key)) changed.push(key)
  }
  return {
    unchanged: same,
    changed_besides_system: changed,
    go_consistent: changed.length === 0,
  }
}

function summarizeBody(body, headers) {
  return {
    ...featureFingerprint(body, headers),
    messages: (body?.messages || []).map((m) => ({
      role: m?.role,
      content:
        typeof m?.content === 'string' ? m.content : `(${Array.isArray(m?.content) ? m.content.length : 0} blocks)`,
    })),
    metadata_user_id: redactUserId(body?.metadata?.user_id),
    system_blocks: summarizeSystem(body?.system),
  }
}

function collectSse() {
  const blocks = new Map()
  const texts = []
  const thinkings = []
  const onEvent = async (line) => {
    if (!String(line).startsWith('data:')) return
    const raw = String(line).slice(5).trim()
    if (!raw || raw === '[DONE]') return
    let ev
    try {
      ev = JSON.parse(raw)
    } catch {
      return
    }
    if (ev.type === 'content_block_start' && ev.content_block) {
      const block = { ...ev.content_block }
      if (block.type === 'text') block.text = block.text || ''
      if (block.type === 'thinking') block.thinking = block.thinking || ''
      blocks.set(ev.index, block)
      return
    }
    if (ev.type === 'content_block_delta' && ev.delta) {
      const block = blocks.get(ev.index) || { type: ev.delta.type }
      if (ev.delta.type === 'text_delta' && ev.delta.text) {
        block.type = 'text'
        block.text = `${block.text || ''}${ev.delta.text}`
        texts.push(ev.delta.text)
      }
      if (ev.delta.type === 'thinking_delta' && ev.delta.thinking) {
        block.type = 'thinking'
        block.thinking = `${block.thinking || ''}${ev.delta.thinking}`
        thinkings.push(ev.delta.thinking)
      }
      if (ev.delta.type === 'signature_delta' && ev.delta.signature) {
        block.signature = `${block.signature || ''}${ev.delta.signature}`
      }
      blocks.set(ev.index, block)
    }
  }
  const assistantContent = () =>
    [...blocks.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, block]) => block)
      .filter(
        (block) =>
          block &&
          (block.type === 'text' ||
            block.type === 'thinking' ||
            block.type === 'redacted_thinking' ||
            block.type === 'tool_use' ||
            block.type === 'server_tool_use'),
      )
  return {
    onEvent,
    text: () => texts.join(''),
    thinking: () => thinkings.join(''),
    assistantContent,
  }
}

export async function hopWorker({ exec, body, headers, identity, outDir, timeoutMs = 120000 }) {
  process.env.KIN_SESSION_DUMP = outDir
  const sse = collectSse()
  const started = Date.now()
  const result = await streamGoWorker({
    exec,
    body,
    reqHeaders: headers,
    identity,
    timeoutMs,
    deliveryMode: 'realtime',
    onEvent: sse.onEvent,
  })
  return {
    ok: !!result.ok,
    status: result.status,
    via: result.via,
    duration_ms: Date.now() - started,
    ttft_ms: result.ttftMs ?? null,
    terminal_state: result.terminalState || null,
    stop_reason: result.stopReason || result.body?.stop_reason || null,
    model: result.model || result.body?.model || null,
    usage: result.usage || result.body?.usage || null,
    text: sse.text().slice(0, 2000),
    thinking: sse.thinking().slice(0, 400),
    assistant_content: sse.assistantContent(),
    error: result.ok ? null : result.body?.error || { message: 'worker error' },
  }
}

function latestDump(dir) {
  if (!dir || !fs.existsSync(dir)) return null
  const files = fs
    .readdirSync(dir)
    .filter((n) => n.endsWith('-envelope.json'))
    .sort()
  if (!files.length) return null
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, files[files.length - 1]), 'utf8'))
  } catch {
    return null
  }
}

function mutateOutboundBody(currentBody, leftover, mutate) {
  if (!mutate) return { ...currentBody, stream: true }
  return {
    ...currentBody,
    system: applyDefaultForwardMutations(currentBody.system, leftover),
    stream: true,
  }
}

function buildShotInbound({ model, prompt, maxTokens, slot, callerSystem, routingFile }) {
  let { inbound, headers } = buildVmTestInbound({
    model,
    prompt,
    maxTokens,
    sessionId: slot.sessionId,
    deviceId: slot.deviceId,
    accountUuid: slot.accountUuid,
    identity: slot.identity,
    rewrite: false,
  })
  if (callerSystem) inbound = { ...inbound, system: callerSystem }
  const leftover = collectCallerSystemAppend(inbound)
  inbound = applyCrsUnofficialPersona(inbound, {
    officialClient: false,
    mode: 'rewrite',
    sessionId: slot.sessionId,
    model,
    identity: slot.identity,
    routingFile,
  })
  return {
    inbound,
    headers,
    leftover,
  }
}

async function runVariant({ label, mutate, leftover, headers, inboundBase, followup, exec, outDir, slot, homeDir }) {
  const current = prepareOutboundEnvelope({
    canonicalBody: inboundBase,
    inbound: inboundBase,
    identity: slot.identity,
    unofficial: false,
    officialClient: true,
    stream: true,
    reqHeaders: headers,
    homeDir,
    sessionId: slot.sessionId,
  })
  const body = mutateOutboundBody(current.body, leftover, mutate)
  const billingText = Array.isArray(body.system) ? String(body.system[0]?.text || '') : ''
  const turn1 = await hopWorker({ exec, body, headers, identity: slot.identity, outDir })
  const dumped = latestDump(outDir)
  const turns = [{ n: 1, prompt: inboundBase.messages?.[0]?.content || 'hello', ...turn1, billing_text: billingText }]
  if (followup && turn1.ok && turn1.assistant_content.length) {
    const turn2Body = {
      ...body,
      messages: [
        inboundBase.messages[0],
        { role: 'assistant', content: turn1.assistant_content },
        { role: 'user', content: followup },
      ],
    }
    const turn2 = await hopWorker({ exec, body: turn2Body, headers, identity: slot.identity, outDir })
    turns.push({ n: 2, prompt: followup, ...turn2 })
  }
  return {
    label,
    mutate_default_forward: mutate,
    leftover_present: !!String(leftover || '').trim(),
    leftover_chars: String(leftover || '').trim().length,
    billing_inline: billingText,
    system_kinds: officialSystemKinds(body.system),
    system_blocks: summarizeSystem(body.system),
    feature_diff: featureDiff(
      featureFingerprint(current.body, current.headers),
      featureFingerprint(body, current.headers),
    ),
    dumped_billing: dumped?.body?.system?.[0]?.text || null,
    turns,
    ok: turns.every((t) => t.ok),
  }
}

function printSystemIfRequested(body) {
  if (!process.argv.includes('--print-system')) return null
  if (!Array.isArray(body?.system)) return String(body?.system || '')
  return body.system.map((block, i) => ({
    i,
    kind: classifyBlock(block?.text),
    cache_control: block?.cache_control || null,
    text:
      classifyBlock(block?.text) === 'agent_prompt'
        ? `${String(block?.text || '').slice(0, 240)}…`
        : String(block?.text || ''),
  }))
}

async function main() {
  const dumpOnly = process.argv.includes('--dump') || process.argv.includes('--dump-only')
  const compare = process.argv.includes('--compare')
  const mutate = compare ? true : process.argv.includes('--mutate') || !process.argv.includes('--no-mutate')
  const projectRoot = String(arg('--root', process.env.KIN_PROJECT_ROOT || DEFAULT_ROOT))
  const vmId = String(arg('--vm', process.env.KIN_SHOT_VM || DEFAULT_VM))
  const model = String(arg('--model', DEFAULT_MODEL))
  const prompt = String(arg('--prompt', DEFAULT_PROMPT))
  const followup = String(arg('--followup', '用一句话继续刚才的对话'))
  const maxTokens = Number(arg('--max-tokens', String(DEFAULT_MAX_TOKENS))) || DEFAULT_MAX_TOKENS
  const outDir = String(arg('--out', path.join(projectRoot, 'data', 'shots')))
  const via = String(arg('--via', 'worker'))
  const routingFile = path.join(projectRoot, 'src', 'config', 'routing.json')
  const callerSystem = readCallerSystemArg()

  const vm = getVm(projectRoot, vmId)
  if (!vm) {
    console.error(JSON.stringify({ ok: false, error: `vm not found: ${vmId}` }))
    process.exit(2)
  }

  const homeDir = path.join(projectRoot, 'vms', vmId, 'cli-home')
  const slotCred = readSlotCredentialIdentity(homeDir)
  const slot = slotTestIdentity(projectRoot, vm)
  const { inbound, headers, leftover } = buildShotInbound({
    model,
    prompt,
    maxTokens,
    slot,
    callerSystem,
    routingFile: fs.existsSync(routingFile) ? routingFile : '',
  })

  const current = prepareOutboundEnvelope({
    canonicalBody: inbound,
    inbound,
    identity: slot.identity,
    unofficial: false,
    officialClient: true,
    stream: true,
    reqHeaders: headers,
    homeDir,
    sessionId: slot.sessionId,
  })
  const mutatedBody = mutateOutboundBody(current.body, leftover, true)
  const baselineBody = mutateOutboundBody(current.body, leftover, false)

  const exec = slotExec(projectRoot, vm)
  const paths = workerPaths(exec)
  const report = {
    ok: true,
    vm_id: vmId,
    vm_name: vm.name || null,
    via,
    hop: 'go-worker-envelope',
    note: 'Mutate the current rewrite envelope: billing line carries the official sentence; caller leftover is system[1] only when present; agent + slot Environment stay.',
    has_worker_access: !!slotCred?.has_access,
    has_worker_refresh: !!slotCred?.has_refresh,
    has_proxy: !!(vm.proxy?.url || vm.proxy?.host),
    worker_sock: !!(paths.socketPath && fs.existsSync(paths.socketPath)),
    leftover_present: !!leftover,
    leftover_chars: leftover.length,
    prompt,
    followup,
    model,
    current_default: summarizeBody(baselineBody, current.headers),
    mutated: summarizeBody(mutatedBody, current.headers),
    feature_diff: featureDiff(
      featureFingerprint(baselineBody, current.headers),
      featureFingerprint(mutatedBody, current.headers),
    ),
    printed_system: printSystemIfRequested(mutatedBody),
  }

  fs.mkdirSync(outDir, { recursive: true })
  if (dumpOnly) {
    report.mutated_billing = Array.isArray(mutatedBody.system) ? mutatedBody.system[0]?.text : null
    report.mutated_kinds = summarizeSystem(mutatedBody.system).map((b) => b.kind)
    console.log(JSON.stringify(report, null, 2))
    return
  }

  if (!slotCred?.has_access && !slotCred?.has_refresh) {
    console.error(JSON.stringify({ ok: false, error: 'worker credentials.json has no access/refresh presence' }))
    process.exit(2)
  }
  if (!vm.proxy?.url && !vm.proxy?.host) {
    console.error(JSON.stringify({ ok: false, error: 'vm has no SOCKS5' }))
    process.exit(2)
  }
  if (via !== 'worker') {
    console.error(JSON.stringify({ ok: false, error: 'this shot hops the Go worker only (--via worker)' }))
    process.exit(2)
  }

  const common = {
    leftover,
    headers,
    inboundBase: inbound,
    followup,
    exec,
    outDir,
    slot,
    homeDir,
  }
  if (compare) {
    report.baseline = await runVariant({ ...common, label: 'four_blocks', mutate: false })
    report.in_billing_header = await runVariant({ ...common, label: 'billing_plus_caller', mutate: true })
    report.ok = !!(report.baseline.ok && report.in_billing_header.ok)
    report.dialogue_diff = {
      t1_same: report.baseline.turns[0]?.text === report.in_billing_header.turns[0]?.text,
      t2_same: report.baseline.turns[1]?.text === report.in_billing_header.turns[1]?.text,
      baseline_texts: report.baseline.turns.map((t) => t.text),
      billing_texts: report.in_billing_header.turns.map((t) => t.text),
      baseline_stops: report.baseline.turns.map((t) => t.stop_reason),
      billing_stops: report.in_billing_header.turns.map((t) => t.stop_reason),
    }
  } else {
    report.variant = await runVariant({
      ...common,
      label: mutate ? 'billing_plus_caller' : 'four_blocks',
      mutate,
    })
    report.ok = !!report.variant.ok
  }
  console.log(JSON.stringify(report, null, 2))
  if (!report.ok) process.exit(1)
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  main().catch((err) => {
    console.error(JSON.stringify({ ok: false, error: String(err?.message || err).slice(0, 400) }))
    process.exit(1)
  })
}
