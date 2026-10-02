import test from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import { makeProxyFetch } from '../../src/lib/protocol/codex-models.mjs'

// No-auth SOCKS5 peer that records the CONNECT host and answers the tunnelled HTTP request itself.
function socks5Peer(seen) {
  return net.createServer((socket) => {
    socket.once('data', () => {
      socket.write(Buffer.from([5, 0]))
      socket.once('data', (req) => {
        seen.push(req.subarray(5, 5 + req[4]).toString())
        socket.write(Buffer.from([5, 0, 0, 1, 0, 0, 0, 0, 0, 0]))
        socket.once('data', () => socket.end('HTTP/1.1 200 OK\r\ncontent-length: 2\r\nconnection: close\r\n\r\nok'))
      })
    })
  })
}

test('SOCKS5 proxy on an IPv6 literal is dialled, with the destination resolved remotely', async (t) => {
  const seen = []
  const peer = socks5Peer(seen)
  await new Promise((resolve) => peer.listen(0, '::1', resolve))
  t.after(() => peer.close())
  const res = await makeProxyFetch(`socks5://[::1]:${peer.address().port}`)('http://upstream.invalid/')
  assert.equal(await res.text(), 'ok')
  assert.deepEqual(seen, ['upstream.invalid'])
})

test('an unsupported proxy scheme throws instead of going direct', () => {
  assert.throws(() => makeProxyFetch('ftp://127.0.0.1:21')('http://upstream.invalid/'), /unsupported proxy scheme/)
})
