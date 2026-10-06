import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import https from 'node:https'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { sessionKeyToOAuth } from '../../src/lib/oauth/cookie-auth.mjs'

test('OAuth binary binds the organization in authorize before checking session freshness', {
  timeout: 30000,
}, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kin-oauth-authorize-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const key = path.join(root, 'key.pem')
  const cert = path.join(root, 'cert.pem')
  try {
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        key,
        '-out',
        cert,
        '-days',
        '1',
        '-subj',
        '/CN=claude.ai',
        '-addext',
        'subjectAltName=DNS:claude.ai,DNS:platform.claude.com',
      ],
      { stdio: 'ignore' },
    )
  } catch (e) {
    if (e.code !== 'ENOENT') throw e
    t.skip('openssl unavailable')
    return
  }
  const org = '12345678-1234-4234-8234-123456789abc'
  const upstream = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    res.setHeader('content-type', 'application/json')
    if (req.method === 'GET' && req.url === '/api/organizations') {
      res.end(JSON.stringify([{ uuid: org, raven_type: 'team' }]))
      return
    }
    if (req.method === 'POST' && req.url === `/v1/oauth/${org}/authorize`) {
      const payload = JSON.parse(Buffer.concat(chunks).toString())
      if (payload.organization_uuid !== org) {
        res.writeHead(400)
        res.end(JSON.stringify({ error: { type: 'invalid_request_error', message: 'Invalid request format' } }))
        return
      }
      res.writeHead(403)
      res.end(
        JSON.stringify({ error: { type: 'permission_error', message: 'Session is not fresh enough to authorize' } }),
      )
      return
    }
    res.writeHead(404)
    res.end('{}')
  })
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve))
  const sockets = new Set()
  const proxy = net.createServer((socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.on('error', () => {})
    let pending = Buffer.alloc(0)
    let greeted = false
    const onData = (chunk) => {
      pending = Buffer.concat([pending, chunk])
      if (!greeted) {
        if (pending.length < 2 || pending.length < 2 + pending[1]) return
        pending = pending.subarray(2 + pending[1])
        greeted = true
        socket.write(Buffer.from([5, 0]))
      }
      if (pending.length < 5 || pending.length < 7 + pending[4]) return
      socket.off('data', onData)
      const target = net.connect(upstream.address().port, '127.0.0.1', () => {
        socket.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 0]))
        socket.pipe(target).pipe(socket)
      })
      sockets.add(target)
      target.on('close', () => sockets.delete(target))
      target.on('error', () => socket.destroy())
      socket.on('close', () => target.destroy())
    }
    socket.on('data', onData)
  })
  await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve))
  t.after(async () => {
    for (const socket of sockets) socket.destroy()
    await Promise.all([
      new Promise((resolve) => proxy.close(resolve)),
      new Promise((resolve) => upstream.close(resolve)),
    ])
  })
  const previousCerts = process.env.NODE_EXTRA_CA_CERTS
  process.env.NODE_EXTRA_CA_CERTS = cert
  t.after(() => {
    if (previousCerts === undefined) delete process.env.NODE_EXTRA_CA_CERTS
    else process.env.NODE_EXTRA_CA_CERTS = previousCerts
  })
  await assert.rejects(
    sessionKeyToOAuth('sk-ant-sid01-testaaaaaaaa', {
      proxyUrl: `socks5h://127.0.0.1:${proxy.address().port}`,
      timeoutMs: 5000,
    }),
    { code: 'session_stale_relogin' },
  )
})
