import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import net from 'node:net'
import { once } from 'node:events'
import { createSocksProxyAgent } from '../../src/lib/vm/proxy-agent.mjs'
import { createNodeEgressSocks } from '../../src/lib/cluster/node-egress-socks.mjs'

function get(url, agent) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { agent }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (c) => (body += c))
      res.on('end', () => resolve({ status: res.statusCode, body }))
    })
    req.on('error', reject)
  })
}

async function origin(t) {
  const server = http.createServer((req, res) => res.end(`hello ${req.url}`))
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => server.close())
  return server.address().port
}

test('CONNECT is dialed by the named node and relays both directions', async (t) => {
  const port = await origin(t)
  const dials = []
  const front = createNodeEgressSocks({
    openChannel: async (nodeId, host, dstPort) => {
      dials.push({ nodeId, host, dstPort })
      return net.connect(port, '127.0.0.1')
    },
  })
  await front.listen()
  t.after(() => front.close())
  const res = await get('http://origin.invalid/x', createSocksProxyAgent(front.url('node a/1')))
  assert.deepEqual(res, { status: 200, body: 'hello /x' })
  // socks5h: the name reaches the node unresolved, so the node's resolver picks the address.
  assert.deepEqual(dials, [{ nodeId: 'node a/1', host: 'origin.invalid', dstPort: 80 }])
})

test('a node link that is not ready fails the request instead of going direct', async (t) => {
  await origin(t)
  const front = createNodeEgressSocks({
    openChannel: async () => {
      throw Object.assign(new Error('节点未连接'), { code: 'node_not_ready' })
    },
  })
  await front.listen()
  t.after(() => front.close())
  await assert.rejects(get('http://127.0.0.1:1/', createSocksProxyAgent(front.url('node-a'))))
})

test('a wrong secret never opens a channel', async (t) => {
  let opened = false
  const front = createNodeEgressSocks({
    openChannel: async () => {
      opened = true
      throw new Error('unexpected')
    },
  })
  await front.listen()
  t.after(() => front.close())
  const forged = new URL(front.url('node-a'))
  forged.password = 'x'.repeat(48)
  await assert.rejects(get('http://127.0.0.1:1/', createSocksProxyAgent(forged.toString())))
  assert.equal(opened, false)
})
