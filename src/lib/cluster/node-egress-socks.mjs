/**
 * Loopback SOCKS5 front for a cluster node's own exit.
 *
 * A node slot bound to local egress leaves from that node's IP. Requests the
 * control plane makes on the slot's behalf (OAuth exchange / refresh, test
 * chat, geo lookup) must leave from the same IP, so every CONNECT here becomes
 * a direct-tcpip channel on the node's existing SSH link: the node's sshd
 * resolves (socks5h) and dials the destination. A link that is not ready fails
 * the CONNECT; there is no fallback to the control plane's own route.
 *
 * Username = node id, password = a per-process secret: other local users can
 * reach 127.0.0.1 but cannot borrow a node's exit.
 */
import crypto from 'node:crypto'
import net from 'node:net'

const HANDSHAKE_TIMEOUT_MS = 15_000
const MAX_CONNECTIONS = 256

const REPLY = Object.freeze({
  ok: 0x00,
  failure: 0x01,
  notAllowed: 0x02,
  hostUnreachable: 0x04,
  refused: 0x05,
  cmdUnsupported: 0x07,
  atypUnsupported: 0x08,
})

export class NodeEgressError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

/** Read exactly `n` bytes from a paused socket; rejects when it closes first. */
function readExact(socket, n) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      socket.off('readable', attempt)
      socket.off('end', closed)
      socket.off('close', closed)
    }
    const closed = () => {
      cleanup()
      reject(new Error('socks client closed during handshake'))
    }
    function attempt() {
      const chunk = socket.read(n)
      if (chunk === null) return false
      cleanup()
      if (chunk.length < n) reject(new Error('socks client closed during handshake'))
      else resolve(chunk)
      return true
    }
    if (attempt()) return
    socket.on('readable', attempt)
    socket.once('end', closed)
    socket.once('close', closed)
  })
}

async function readHost(socket, atyp) {
  if (atyp === 0x01) return Array.from(await readExact(socket, 4)).join('.')
  if (atyp === 0x03) {
    const [len] = await readExact(socket, 1)
    if (!len) return null
    return (await readExact(socket, len)).toString('utf8')
  }
  if (atyp === 0x04) {
    const raw = await readExact(socket, 16)
    const groups = []
    for (let i = 0; i < 16; i += 2) groups.push(raw.readUInt16BE(i).toString(16))
    return groups.join(':')
  }
  return null
}

function replyFor(err) {
  const text = String(err?.message || err)
  if (/prohibited/i.test(text)) return REPLY.notAllowed
  if (/refused/i.test(text)) return REPLY.refused
  if (err?.code === 'node_not_ready' || err?.code === 'node_not_found' || err?.code === 'cluster_unavailable') {
    return REPLY.failure
  }
  return REPLY.hostUnreachable
}

function reply(socket, code) {
  socket.end(Buffer.from([0x05, code, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
}

function sameSecret(given, secret) {
  return given.length === secret.length && crypto.timingSafeEqual(given, secret)
}

/**
 * @param {object} opts
 * @param {(nodeId: string, host: string, port: number) => Promise<import('node:stream').Duplex>} opts.openChannel
 */
export function createNodeEgressSocks({ openChannel, host = '127.0.0.1' }) {
  const secret = Buffer.from(crypto.randomBytes(24).toString('hex'))
  const sockets = new Set()
  const server = net.createServer({ allowHalfOpen: true }, (socket) => {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
    socket.on('error', () => socket.destroy())
    socket.setTimeout(HANDSHAKE_TIMEOUT_MS, () => socket.destroy())
    serve(socket).catch(() => socket.destroy())
  })
  server.maxConnections = MAX_CONNECTIONS

  async function serve(socket) {
    const [ver, nMethods] = await readExact(socket, 2)
    if (ver !== 0x05 || !nMethods) return socket.destroy()
    const methods = await readExact(socket, nMethods)
    if (!methods.includes(0x02)) return socket.end(Buffer.from([0x05, 0xff]))
    socket.write(Buffer.from([0x05, 0x02]))

    const [authVer, userLen] = await readExact(socket, 2)
    const user = userLen ? (await readExact(socket, userLen)).toString('utf8') : ''
    const [passLen] = await readExact(socket, 1)
    const pass = passLen ? await readExact(socket, passLen) : Buffer.alloc(0)
    if (authVer !== 0x01 || !user || !sameSecret(pass, secret)) return socket.end(Buffer.from([0x01, 0x01]))
    socket.write(Buffer.from([0x01, 0x00]))

    const [reqVer, cmd, , atyp] = await readExact(socket, 4)
    if (reqVer !== 0x05) return socket.destroy()
    const dstHost = await readHost(socket, atyp)
    const dstPort = (await readExact(socket, 2)).readUInt16BE(0)
    if (cmd !== 0x01) return reply(socket, REPLY.cmdUnsupported)
    if (!dstHost) return reply(socket, REPLY.atypUnsupported)

    let channel
    try {
      channel = await openChannel(user, dstHost, dstPort)
    } catch (err) {
      return reply(socket, replyFor(err))
    }
    if (socket.destroyed) return channel.destroy()
    socket.setTimeout(0)
    socket.write(Buffer.from([0x05, REPLY.ok, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
    channel.on('error', () => socket.destroy())
    channel.once('close', () => socket.destroy())
    socket.once('close', () => channel.destroy())
    socket.pipe(channel)
    channel.pipe(socket)
  }

  return {
    listen() {
      return new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(0, host, () => {
          server.off('error', reject)
          server.unref()
          resolve(server.address().port)
        })
      })
    },
    url(nodeId) {
      const addr = server.address()
      if (!addr) throw new NodeEgressError('node_egress_unavailable', '节点出口转发未启动')
      return `socks5h://${encodeURIComponent(nodeId)}:${secret.toString()}@${host}:${addr.port}`
    },
    close() {
      for (const socket of sockets) socket.destroy()
      return new Promise((resolve) => server.close(() => resolve()))
    },
  }
}

/** direct-tcpip from the node: the node's sshd resolves and dials. */
export function openNodeChannel(client, host, port) {
  return new Promise((resolve, reject) => {
    client.forwardOut('127.0.0.1', 0, host, port, (err, stream) => {
      if (err) return reject(err)
      resolve(stream)
    })
  })
}

let front = null

/** Bound once at server start, next to bindPlacement. `clientFor` throws when the node link is not ready. */
export async function startNodeEgressSocks({ clientFor }) {
  if (front) return front
  const created = createNodeEgressSocks({
    openChannel: (nodeId, host, port) => openNodeChannel(clientFor(nodeId), host, port),
  })
  await created.listen()
  front = created
  return front
}

export async function stopNodeEgressSocks() {
  const current = front
  front = null
  if (current) await current.close()
}

/** SOCKS5 URL whose exit is `nodeId`'s own route. Throws instead of handing back a direct route. */
export function nodeEgressProxyUrl(nodeId) {
  if (!front) throw new NodeEgressError('node_egress_unavailable', '节点出口转发未启动')
  return front.url(nodeId)
}
