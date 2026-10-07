/**
 * Text the safety model actually sees.
 * Same two passes as jev-safety-gateway: drop <system-reminder> blocks first,
 * then decode long standard-base64 runs that are real text. A payload inside
 * a reminder is dropped with the reminder. Hashes, ids, and binary stay put.
 */

const REMINDER_OPEN = '<system-reminder>'
const REMINDER_CLOSE = '</system-reminder>'
const MIN_RUN = 32
const MAX_RUN = 64 * 1024
const MAX_DECODED = 64 * 1024
const MAX_SEGMENTS = 8
const MAX_PASSES = 3

function lowerASCII(code) {
  return code >= 65 && code <= 90 ? code + 32 : code
}

function indexFold(text, needle, from) {
  const first = lowerASCII(needle.charCodeAt(0))
  const limit = text.length - needle.length
  for (let i = from; i <= limit; i++) {
    if (lowerASCII(text.charCodeAt(i)) !== first) continue
    let ok = true
    for (let j = 1; j < needle.length; j++) {
      if (lowerASCII(text.charCodeAt(i + j)) !== lowerASCII(needle.charCodeAt(j))) {
        ok = false
        break
      }
    }
    if (ok) return i
  }
  return -1
}

export function stripReminders(text) {
  let rest = String(text || '')
  if (indexFold(rest, REMINDER_OPEN, 0) < 0) return rest
  let out = ''
  for (;;) {
    const open = indexFold(rest, REMINDER_OPEN, 0)
    if (open < 0) {
      out += rest
      break
    }
    out += rest.slice(0, open)
    rest = rest.slice(open + REMINDER_OPEN.length)
    const close = indexFold(rest, REMINDER_CLOSE, 0)
    if (close < 0) break
    rest = rest.slice(close + REMINDER_CLOSE.length)
  }
  return out.trim()
}

function isB64Byte(code) {
  return (
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    (code >= 48 && code <= 57) ||
    code === 43 ||
    code === 47 ||
    code === 61
  )
}

function looksLikeText(value) {
  const chars = [...value]
  if (!chars.length) return false
  let printable = 0
  let letters = 0
  for (const ch of chars) {
    if (ch === '\n' || ch === '\r' || ch === '\t') {
      printable++
      continue
    }
    const code = ch.codePointAt(0)
    const print = code === 32 || (code > 32 && code !== 127)
    if (!print) continue
    printable++
    if (/^\p{L}$/u.test(ch)) letters++
  }
  return letters > 0 && printable * 10 >= chars.length * 9
}

function decodeText(run) {
  const slice = run.length > MAX_RUN ? run.slice(0, MAX_RUN - (MAX_RUN % 4)) : run
  if (slice.length % 4 !== 0) return ''
  let raw
  try {
    raw = Buffer.from(slice, 'base64')
  } catch {
    return ''
  }
  if (!raw.length) return ''
  const text = raw.toString('utf8')
  if (Buffer.from(text, 'utf8').compare(raw) !== 0) return ''
  if (Buffer.from(text).toString('base64') !== slice) return ''
  return looksLikeText(text) ? text : ''
}

function expandOnce(text) {
  let out = ''
  let last = 0
  let decoded = 0
  let segments = 0
  let changed = false
  for (let i = 0; i < text.length; ) {
    if (!isB64Byte(text.charCodeAt(i))) {
      i++
      continue
    }
    let j = i
    while (j < text.length && isB64Byte(text.charCodeAt(j))) j++
    const run = text.slice(i, j)
    if (run.length >= MIN_RUN && segments < MAX_SEGMENTS && decoded < MAX_DECODED) {
      const plain = decodeText(run)
      if (plain) {
        out += text.slice(last, i) + plain
        last = j
        decoded += plain.length
        segments++
        changed = true
      }
    }
    i = j
  }
  if (!changed) return text
  return out + text.slice(last)
}

export function expandBase64(text) {
  let current = String(text || '')
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const next = expandOnce(current)
    if (next === current) break
    current = next
  }
  return current
}

export function prepareInterceptText(text, { stripReminders: strip = true, expandBase64: expand = true } = {}) {
  let out = String(text || '')
  if (strip) out = stripReminders(out)
  if (expand) out = expandBase64(out)
  return out.trim()
}
