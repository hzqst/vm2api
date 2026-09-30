/**
 * Detects when a continuing conversation stops being a prefix of its previous
 * turn. Anthropic only reads cache up to the first changed byte, so a break
 * here is a full rewrite upstream even when the request succeeds.
 *
 * Marker movement is not a history break: cache_control is stripped before
 * hashing. Image bytes and prompt text are never stored.
 */
import { createHash } from 'node:crypto'
import { listCacheMarkers, normalizeCacheTtl } from './cache-ttl.mjs'

const SESSION_LIMIT = 10_000
/** Longest cache TTL; an older turn cannot be read anyway. */
const SESSION_IDLE_MS = 60 * 60_000
const sessions = new Map()
const IMAGE_TYPES = new Set(['image', 'input_image', 'image_url'])

function digest(value) {
  return createHash('sha256')
    .update(JSON.stringify(value ?? null))
    .digest('hex')
    .slice(0, 16)
}

function firstDivergence(previous, current) {
  const shared = Math.min(previous.length, current.length)
  for (let i = 0; i < shared; i++) {
    if (previous[i] !== current[i]) return i
  }
  return previous.length > current.length ? shared : -1
}

function withoutCacheControl(value) {
  if (!value || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(withoutCacheControl)
  const out = {}
  for (const [key, nested] of Object.entries(value)) {
    if (key === 'cache_control') continue
    out[key] = withoutCacheControl(nested)
  }
  return out
}
function imageMeta(block) {
  const source = block?.source && typeof block.source === 'object' ? block.source : block
  const data = source?.data || source?.base64 || block?.data || ''
  const url = source?.url || block?.image_url?.url || block?.url || null
  return {
    type: block?.type || 'image',
    media_type: source?.media_type || block?.media_type || null,
    url: Boolean(url),
    bytes: typeof data === 'string' ? data.length : 0,
    digest: typeof data === 'string' && data ? digest(data) : url ? digest(url) : null,
  }
}

function partKind(block) {
  if (typeof block === 'string') return { kind: 'text', digest: digest(block) }
  if (!block || typeof block !== 'object') return { kind: 'structure', digest: digest(block) }
  const type = block.type
  if (IMAGE_TYPES.has(type) || block.source || block.image_url) {
    return { kind: 'image', digest: digest(imageMeta(block)) }
  }
  if (type === 'text' || type === 'input_text') return { kind: 'text', digest: digest(block.text || '') }
  return { kind: 'structure', digest: digest(withoutCacheControl(block)) }
}

function contentParts(content) {
  if (typeof content === 'string') return [{ kind: 'text', digest: digest(content) }]
  if (!Array.isArray(content)) return [{ kind: 'structure', digest: digest(content) }]
  return content.map(partKind)
}
function messageRecord(message) {
  return {
    hash: digest(withoutCacheControl(message)),
    role: message?.role || null,
    parts: contentParts(message?.content),
  }
}

function snapshotBody(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : []
  return {
    tools: digest(withoutCacheControl(body?.tools)),
    system: digest(withoutCacheControl(body?.system)),
    messages: messages.map(messageRecord),
  }
}

function classifyParts(previous, current) {
  if (!previous || !current) return 'structure'
  if (previous.role !== current.role || previous.parts.length !== current.parts.length) return 'structure'
  for (let i = 0; i < previous.parts.length; i++) {
    const left = previous.parts[i]
    const right = current.parts[i]
    if (left.kind !== right.kind) return 'structure'
    if (left.digest !== right.digest) return left.kind
  }
  return 'structure'
}

/**
 * Same-request inbound vs Node outbound first difference. No prompt/image bytes.
 */
export function firstHistoryDiff(inbound, outbound) {
  if (!inbound || !outbound || typeof inbound !== 'object' || typeof outbound !== 'object') {
    return { section: null, index: null, kind: null }
  }
  const previous = snapshotBody(inbound)
  const current = snapshotBody(outbound)
  if (previous.tools !== current.tools) return { section: 'tools', index: null, kind: 'structure' }
  if (previous.system !== current.system) return { section: 'system', index: null, kind: 'text' }
  const prevHashes = previous.messages.map((message) => message.hash)
  const currHashes = current.messages.map((message) => message.hash)
  const index = firstDivergence(prevHashes, currHashes)
  if (index < 0) return { section: null, index: null, kind: null }
  return {
    section: 'messages',
    index,
    kind: classifyParts(previous.messages[index], current.messages[index]),
  }
}

export function describeCacheContinuity({
  inbound,
  outbound,
  layer = 'node_object',
  ttl = null,
  sessionId = null,
  vmId = null,
  accountId = null,
  requestId = null,
} = {}) {
  const observed = layer === 'cli_final_wire'
  return {
    layer,
    wire_observed: observed,
    ttl: ttl ? normalizeCacheTtl(ttl) : null,
    markers: listCacheMarkers(outbound),
    inbound_to_outbound: firstHistoryDiff(inbound, outbound),
    session_id: sessionId || null,
    vm_id: vmId || null,
    account_id: accountId || null,
    request_id: requestId || null,
  }
}

/**
 * Record `body` as the latest turn of `sessionKey` and compare it with the
 * previous one. Returns null for an unkeyed request; otherwise the turn number
 * and the first section (tools → system → messages) that no longer matches.
 */
export function trackCachePrefix(sessionKey, body, now = Date.now()) {
  const key = String(sessionKey || '').trim()
  if (!key || !body || typeof body !== 'object') return null
  const current = snapshotBody(body)
  const hit = sessions.get(key)
  const previous = hit && now - hit.at < SESSION_IDLE_MS ? hit : null
  sessions.delete(key)
  sessions.set(key, { ...current, turn: (previous?.turn || 0) + 1, at: now })
  if (sessions.size > SESSION_LIMIT) sessions.delete(sessions.keys().next().value)
  const turn = (previous?.turn || 0) + 1
  if (!previous) return { turn, break: null }
  if (previous.tools !== current.tools) return { turn, break: { section: 'tools', kind: 'structure' } }
  if (previous.system !== current.system) return { turn, break: { section: 'system', kind: 'text' } }
  const prevHashes = previous.messages.map((message) => message.hash)
  const currHashes = current.messages.map((message) => message.hash)
  const index = firstDivergence(prevHashes, currHashes)
  if (index >= 0) {
    return {
      turn,
      break: {
        section: 'messages',
        index,
        kind: classifyParts(previous.messages[index], current.messages[index]),
      },
    }
  }
  return { turn, break: null }
}

export function clearCachePrefixSessions() {
  sessions.clear()
}
