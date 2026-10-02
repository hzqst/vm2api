/**
 * Minimal ustar: enough to stream a Docker build context and to move single
 * slot files through the Engine archive API (`/containers/{id}/archive`).
 */

import fs from 'node:fs'
import { Readable } from 'node:stream'

const TYPE = { file: '0', symlink: '2', dir: '5' }

function octal(n, width) {
  return `${n.toString(8).padStart(width - 1, '0')}\0`
}

function tarHeader({ name, size = 0, mode, type = 'file', linkname = '' }) {
  const h = Buffer.alloc(512)
  if (Buffer.byteLength(name) > 100) throw new Error(`tar name too long: ${name}`)
  if (Buffer.byteLength(linkname) > 100) throw new Error(`tar link too long: ${linkname}`)
  h.write(name, 0, 100, 'utf8')
  h.write(octal(mode, 8), 100)
  h.write('0000000\0', 108) // uid root
  h.write('0000000\0', 116) // gid root
  h.write(octal(size, 12), 124)
  h.write(octal(Math.floor(Date.now() / 1000), 12), 136)
  h.write('        ', 148) // checksum placeholder
  h.write(TYPE[type], 156)
  h.write(linkname, 157, 100, 'utf8')
  h.write('ustar\0', 257)
  h.write('00', 263)
  let sum = 0
  for (const b of h) sum += b
  h.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148)
  return h
}

/**
 * Entries: `{name, mode, body}` / `{name, mode, src}` files, `{name, mode, type:'dir'}`,
 * `{name, type:'symlink', linkname}`. Headers + bytes + 512 padding, then two zero blocks.
 */
export function tarStream(entries) {
  async function* gen() {
    for (const e of entries) {
      if (e.type === 'dir' || e.type === 'symlink') {
        yield tarHeader({
          name: e.name,
          mode: e.mode ?? (e.type === 'dir' ? 0o755 : 0o777),
          type: e.type,
          linkname: e.linkname,
        })
        continue
      }
      const size = e.body ? e.body.length : fs.statSync(e.src).size
      yield tarHeader({ name: e.name, size, mode: e.mode ?? 0o644 })
      if (e.body) yield e.body
      else for await (const chunk of fs.createReadStream(e.src)) yield chunk
      const pad = (512 - (size % 512)) % 512
      if (pad) yield Buffer.alloc(pad)
    }
    yield Buffer.alloc(1024)
  }
  return Readable.from(gen())
}

export async function tarBuffer(entries) {
  const chunks = []
  for await (const c of tarStream(entries)) chunks.push(c)
  return Buffer.concat(chunks)
}

/** First entry of an uncompressed tar: `{name, type, size, body, linkname}` (`type` is the raw typeflag). */
export function readFirstTarEntry(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 512) return null
  const h = buf.subarray(0, 512)
  const field = (off, len) => h.toString('utf8', off, off + len).replace(/\0.*$/s, '')
  const size = Number.parseInt(field(124, 12).trim() || '0', 8)
  const type = field(156, 1) || '0'
  return {
    name: field(0, 100),
    type,
    size,
    linkname: field(157, 100),
    body: buf.subarray(512, 512 + size),
  }
}
