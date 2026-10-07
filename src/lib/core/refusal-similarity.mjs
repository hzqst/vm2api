/**
 * Near-duplicate refusal matching.
 *
 * The document is normalized user turns only. A shared Claude Code system
 * prefix must not push two different requests over the line. Exact SHA-256
 * still covers the full prompt, including system.
 *
 * 90% means estimated Jaccard of 24-character shingles. A 50k-token body
 * with a small edit stays above the line; a different ask does not.
 */
import { normalizeText } from './distill-detect.mjs'

export const REFUSAL_SIMILARITY = 0.9
/** Below this, shingle overlap is noise. Exact fingerprint still applies. */
export const REFUSAL_SIMILARITY_MIN_CHARS = 512
const SHINGLE = 24
const STEP = 12
const MAX_SHINGLES = 4096
const SLOTS = 128

function contentToText(content) {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part
        if (part && typeof part.text === 'string') return part.text
        if (part && typeof part.content === 'string') return part.content
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  if (content && typeof content.text === 'string') return content.text
  return ''
}

function userTexts(body) {
  if (!body || typeof body !== 'object') return []
  const out = []
  const messages = Array.isArray(body.messages) ? body.messages : []
  for (const message of messages) {
    if (message?.role === 'user') {
      const text = contentToText(message.content)
      if (text) out.push(text)
    }
  }
  if (typeof body.input === 'string' && body.input) out.push(body.input)
  else if (Array.isArray(body.input)) {
    const text = contentToText(body.input)
    if (text) out.push(text)
  }
  return out
}

/** User turns from inbound, then body, with exact repeats dropped. */
export function refusalUserDocument(inbound, body = inbound) {
  const seen = new Set()
  const parts = []
  for (const src of [inbound, body]) {
    for (const text of userTexts(src)) {
      const norm = normalizeText(text)
      if (!norm || seen.has(norm)) continue
      seen.add(norm)
      parts.push(norm)
    }
  }
  return parts.join('\n')
}

function fnv1a(text) {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function shingles(text) {
  if (text.length <= SHINGLE) return [text]
  const raw = Math.floor((text.length - SHINGLE) / STEP) + 1
  const stride = raw > MAX_SHINGLES ? Math.ceil(raw / MAX_SHINGLES) : 1
  const step = STEP * stride
  const out = []
  for (let i = 0; i + SHINGLE <= text.length; i += step) out.push(text.slice(i, i + SHINGLE))
  return out
}

/** 128-slot MinHash, or null when the document is too short to compare. */
export function refusalSignature(text) {
  const norm = normalizeText(text)
  if (norm.length < REFUSAL_SIMILARITY_MIN_CHARS) return null
  const sig = new Uint32Array(SLOTS)
  sig.fill(0xffffffff)
  for (const gram of shingles(norm)) {
    const h1 = fnv1a(gram)
    const h2 = (fnv1a(`\u0001${gram}`) | 1) >>> 0
    for (let i = 0; i < SLOTS; i++) {
      const mixed = (h1 + Math.imul(i, h2)) >>> 0
      if (mixed < sig[i]) sig[i] = mixed
    }
  }
  return Array.from(sig)
}

export function encodeSignature(signature) {
  if (!signature || signature.length !== SLOTS) return null
  return signature.join(',')
}

export function decodeSignature(raw) {
  if (!raw) return null
  const parts = String(raw).split(',')
  if (parts.length !== SLOTS) return null
  const out = []
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null
    out.push(Number(part) >>> 0)
  }
  return out
}

/** Estimated Jaccard. 1 is identical, 0 is no shared slot. */
export function signatureSimilarity(left, right) {
  if (!left || !right || left.length !== right.length || !left.length) return 0
  let same = 0
  for (let i = 0; i < left.length; i++) if (left[i] === right[i]) same += 1
  return same / left.length
}
