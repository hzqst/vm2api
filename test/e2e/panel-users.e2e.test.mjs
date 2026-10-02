import test from 'node:test'
import assert from 'node:assert/strict'
import { startGateway, api } from '../harness.mjs'

async function login(gw, username, password) {
  const res = await fetch(gw.baseUrl + '/api/panel/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  const json = await res.json()
  return { status: res.status, json, cookie: res.headers.get('set-cookie') || '' }
}

async function panel(gw, method, path, { cookie, body } = {}) {
  const res = await fetch(gw.baseUrl + path, {
    method,
    headers: {
      'content-type': 'application/json',
      cookie: cookie || '',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = {}
  try {
    json = JSON.parse(text)
  } catch {}
  return { status: res.status, json, text }
}

test('admin can create users and change passwords', async () => {
  const gw = await startGateway()
  try {
    const admin = await login(gw, 'admin', 'testpass')
    assert.equal(admin.status, 200, JSON.stringify(admin.json))
    assert.equal(admin.json.role, 'admin')

    const created = await panel(gw, 'POST', '/api/panel/users', {
      cookie: admin.cookie,
      body: { username: 'reader', password: 'reader-pass', role: 'user' },
    })
    assert.equal(created.status, 201, JSON.stringify(created.json))
    const item = created.json.data?.item || created.json.item
    assert.equal(item.username, 'reader')
    assert.equal(item.role, 'user')
    assert.equal(item.password_hash, undefined)

    const readerBefore = await login(gw, 'reader', 'reader-pass')
    assert.equal(readerBefore.status, 200)

    const changed = await panel(gw, 'PATCH', `/api/panel/users/${item.id}`, {
      cookie: admin.cookie,
      body: { password: 'reader-next' },
    })
    assert.equal(changed.status, 200, JSON.stringify(changed.json))

    const staleSession = await panel(gw, 'GET', '/api/panel/me', { cookie: readerBefore.cookie })
    assert.equal(staleSession.status, 401)
    const oldLogin = await login(gw, 'reader', 'reader-pass')
    assert.equal(oldLogin.status, 401)
    const nextLogin = await login(gw, 'reader', 'reader-next')
    assert.equal(nextLogin.status, 200)
    assert.equal(nextLogin.json.role, 'user')

    const short = await panel(gw, 'PATCH', `/api/panel/users/${item.id}`, {
      cookie: admin.cookie,
      body: { password: 'short' },
    })
    assert.equal(short.status, 400)
    assert.equal(short.json.error?.code, 'invalid_password')
  } finally {
    await gw.stop()
  }
})

test('admin changing own password keeps the current session', async () => {
  const gw = await startGateway()
  try {
    const admin = await login(gw, 'admin', 'testpass')
    const list = await panel(gw, 'GET', '/api/panel/users', { cookie: admin.cookie })
    const self = (list.json.data?.items || []).find((u) => u.username === 'admin')
    assert.ok(self, JSON.stringify(list.json))

    const changed = await panel(gw, 'PATCH', `/api/panel/users/${self.id}`, {
      cookie: admin.cookie,
      body: { password: 'admin-next-pass' },
    })
    assert.equal(changed.status, 200, JSON.stringify(changed.json))
    const me = await panel(gw, 'GET', '/api/panel/me', { cookie: admin.cookie })
    assert.equal(me.status, 200)
    const relogin = await login(gw, 'admin', 'admin-next-pass')
    assert.equal(relogin.status, 200)
  } finally {
    await gw.stop()
  }
})

test('tenant user cannot list or modify panel users', async () => {
  const gw = await startGateway()
  try {
    const admin = await login(gw, 'admin', 'testpass')
    const created = await panel(gw, 'POST', '/api/panel/users', {
      cookie: admin.cookie,
      body: { username: 'reader', password: 'reader-pass', role: 'user' },
    })
    const readerId = created.json.data?.item?.id
    const user = await login(gw, 'reader', 'reader-pass')
    assert.equal(user.status, 200)

    const users = await panel(gw, 'GET', '/api/panel/users', { cookie: user.cookie })
    assert.equal(users.status, 403)
    const selfPatch = await panel(gw, 'PATCH', `/api/panel/users/${readerId}`, {
      cookie: user.cookie,
      body: { role: 'admin', password: 'escalate-pass' },
    })
    assert.equal(selfPatch.status, 403)
    const database = await panel(gw, 'GET', '/api/panel/database/metrics', { cookie: user.cookie })
    assert.equal(database.status, 403)
    const adminVms = await panel(gw, 'GET', '/admin/vms', { cookie: user.cookie })
    assert.equal(adminVms.status, 403)
  } finally {
    await gw.stop()
  }
})

test('super can toggle schedule but cannot import or delete VMs', async () => {
  const gw = await startGateway()
  try {
    const admin = await login(gw, 'admin', 'testpass')
    await panel(gw, 'POST', '/api/panel/users', {
      cookie: admin.cookie,
      body: { username: 'ops', password: 'super-pass', role: 'super' },
    })
    const superu = await login(gw, 'ops', 'super-pass')
    assert.equal(superu.status, 200)
    assert.equal(superu.json.role, 'super')

    const detail = await panel(gw, 'GET', '/api/panel/vms/vm-sim-01', { cookie: superu.cookie })
    assert.equal(detail.status, 200, JSON.stringify(detail.json))
    const database = await panel(gw, 'GET', '/api/panel/database/metrics', { cookie: superu.cookie })
    assert.equal(database.status, 403)

    const sched = await panel(gw, 'POST', '/api/panel/vms/vm-sim-01/schedulable', {
      cookie: superu.cookie,
      body: { schedulable: false },
    })
    assert.equal(sched.status, 200, JSON.stringify(sched.json))
    assert.equal((sched.json.data || sched.json).schedulable, false)

    const imp = await panel(gw, 'POST', '/api/panel/vms/import', {
      cookie: superu.cookie,
      body: { vm_id: 'vm-sim-01', sessionKey: 'sk-ant-sid01-' + 'e'.repeat(24) },
    })
    assert.equal(imp.status, 403)
    const del = await panel(gw, 'DELETE', '/api/panel/vms/vm-sim-01', { cookie: superu.cookie })
    assert.equal(del.status, 403)
    const oauth = await panel(gw, 'POST', '/api/panel/vms/vm-sim-01/oauth/refresh', {
      cookie: superu.cookie,
      body: {},
    })
    assert.equal(oauth.status, 403)
    const credGet = await panel(gw, 'GET', '/api/panel/vms/vm-sim-01/oauth/credential', {
      cookie: superu.cookie,
    })
    assert.equal(credGet.status, 403)
    const credPut = await panel(gw, 'PUT', '/api/panel/vms/vm-sim-01/oauth/credential', {
      cookie: superu.cookie,
      body: { access_token: 'sk-ant-oat01-DENIED' },
    })
    assert.equal(credPut.status, 403)
  } finally {
    await gw.stop()
  }
})

test('master API key still administers panel users', async () => {
  const gw = await startGateway()
  try {
    const list = await api(gw, 'GET', '/api/panel/users')
    assert.equal(list.status, 200, list.text)
    const items = list.json.data?.items || list.json.items
    assert.ok(Array.isArray(items))
    assert.ok(items.some((u) => u.username === 'admin' && u.role === 'admin'))
  } finally {
    await gw.stop()
  }
})
