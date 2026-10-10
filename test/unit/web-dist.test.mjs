import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { tryServeWebDist } from '../../src/lib/http/web-dist.mjs'

function mockRes() {
  return {
    status: 0,
    headers: null,
    body: null,
    writeHead(status, headers) {
      this.status = status
      this.headers = headers
    },
    end(body) {
      this.body = body
    },
  }
}

test('serves Vite index at /console and assets from web/dist', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vm2api-web-'))
  const dist = path.join(root, 'web', 'dist', 'assets')
  fs.mkdirSync(dist, { recursive: true })
  fs.writeFileSync(path.join(root, 'web', 'dist', 'index.html'), '<!doctype html><title>ok</title>')
  fs.writeFileSync(path.join(dist, 'app.js'), 'console.log(1)')

  const html = mockRes()
  assert.equal(tryServeWebDist(html, root, '/console'), true)
  assert.equal(html.status, 200)
  assert.match(String(html.headers['content-type']), /text\/html/)
  assert.match(String(html.body), /ok/)

  const js = mockRes()
  assert.equal(tryServeWebDist(js, root, '/assets/app.js'), true)
  assert.equal(js.status, 200)
  assert.match(String(js.headers['content-type']), /javascript/)
})

test('caches hashed assets forever but never the index or unhashed files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vm2api-web-cache-'))
  const dist = path.join(root, 'web', 'dist')
  fs.mkdirSync(path.join(dist, 'assets'), { recursive: true })
  fs.mkdirSync(path.join(dist, 'model-icons'), { recursive: true })
  fs.writeFileSync(path.join(dist, 'index.html'), 'x')
  fs.writeFileSync(path.join(dist, 'assets', 'index-Ab12.js'), 'x')
  fs.writeFileSync(path.join(dist, 'model-icons', 'openai.svg'), '<svg/>')

  const serve = (p) => {
    const res = mockRes()
    assert.equal(tryServeWebDist(res, root, p), true)
    return res.headers['cache-control']
  }
  assert.equal(serve('/console'), 'no-store')
  assert.equal(serve('/index.html'), 'no-store')
  assert.match(serve('/assets/index-Ab12.js'), /immutable/)
  assert.doesNotMatch(serve('/model-icons/openai.svg'), /immutable/)
})

test('rejects missing dist, traversal, and /health', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vm2api-web-empty-'))
  assert.equal(tryServeWebDist(mockRes(), root, '/console'), false)

  fs.mkdirSync(path.join(root, 'web', 'dist'), { recursive: true })
  fs.writeFileSync(path.join(root, 'web', 'dist', 'index.html'), 'x')
  assert.equal(tryServeWebDist(mockRes(), root, '/health'), false)
  assert.equal(tryServeWebDist(mockRes(), root, '/../package.json'), false)
})
