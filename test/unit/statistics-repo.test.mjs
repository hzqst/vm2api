import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { closeDatabase, createDatabase, openDatabase } from '../../src/lib/db/database.mjs'
import { UsageLogsRepo } from '../../src/lib/db/repos/usage-logs-repo.mjs'
import { StatisticsRepo, resolveWindow } from '../../src/lib/db/repos/statistics-repo.mjs'
import { createPanelHandler } from '../../src/lib/admin/panel-routes.mjs'

let seq = 0

function seedUsers(db) {
  db.exec(`
    INSERT INTO users (id, email, username, password_hash) VALUES ('u1', 'a@x', 'alice', 'x'), ('u2', 'b@x', 'bob', 'x');
    INSERT INTO api_keys (id, name, key, user_id) VALUES ('k1', 'alice-key', 'sk-1', 'u1'), ('k2', 'bob-key', 'sk-2', 'u2');
    INSERT INTO vms (id, name, vm_json) VALUES ('vm-a', 'Slot A', '{}');
  `)
}

function freshDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kin-stats-'))
  const db = createDatabase({ dbPath: path.join(dir, 'stats.db') })
  seedUsers(db)
  return db
}

function seed(db, rows) {
  const repo = new UsageLogsRepo(db)
  for (const r of rows) {
    seq++
    repo.insertSummary({
      id: `log_${seq}`,
      request_id: `req-${seq}`,
      log_mode: 'normal',
      method: 'POST',
      path: '/v1/messages',
      status: 200,
      model: 'claude-sonnet-4',
      ...r,
    })
  }
}

test('day buckets follow local midnights across a DST change', () => {
  const tz = 'America/New_York'
  const now = Date.parse('2026-03-09T15:00:00Z') // 11:00 EDT, the day after spring-forward
  const { buckets, resolution } = resolveWindow('7days', tz, now)
  assert.equal(resolution, 'day')
  assert.equal(buckets.length, 7)
  assert.equal(new Date(buckets[0]).toISOString(), '2026-03-03T05:00:00.000Z')
  assert.equal(new Date(buckets[5]).toISOString(), '2026-03-08T05:00:00.000Z')
  assert.equal(new Date(buckets[6]).toISOString(), '2026-03-09T04:00:00.000Z')

  const db = freshDb()
  seed(db, [
    { created_at: '2026-03-09T03:30:00.000Z', total_cost: 1 }, // 23:30 EDT on Mar 8
    { created_at: '2026-03-09T04:30:00.000Z', total_cost: 2 }, // 00:30 EDT on Mar 9
  ])
  const data = new StatisticsRepo(db).statistics({ range: '7days', dimension: 'model', tz, now })
  const cost = data.metrics.cost
  assert.equal(cost[5].date, '2026-03-08T05:00:00.000Z')
  assert.equal(cost[5].s0, 1)
  assert.equal(cost[6].s0, 2)
  assert.equal(data.tz, tz)
  assert.equal(data.since, '2026-03-03T05:00:00.000Z')
})

test('hourly buckets start at local midnight in half-hour zones; bad tz falls back to UTC', () => {
  const db = freshDb()
  const now = Date.parse('2026-05-01T00:00:00Z') // 05:30 in Kolkata
  seed(db, [
    { created_at: '2026-04-30T18:29:59.000Z', total_cost: 100 }, // previous local day
    { created_at: '2026-04-30T19:29:00.000Z', total_cost: 1 }, // 00:59 local
    { created_at: '2026-04-30T19:30:00.000Z', total_cost: 2 }, // 01:00 local
  ])
  const repo = new StatisticsRepo(db)
  const data = repo.statistics({ range: 'today', dimension: 'model', tz: 'Asia/Kolkata', now })
  assert.equal(data.resolution, 'hour')
  assert.equal(data.metrics.cost.length, 6)
  assert.equal(data.metrics.cost[0].date, '2026-04-30T18:30:00.000Z')
  assert.equal(data.metrics.cost[0].s0, 1)
  assert.equal(data.metrics.cost[1].s0, 2)
  assert.equal(data.totals.cost, 3)
  const utc = repo.statistics({ range: 'today', tz: 'Mars/Base', now })
  assert.equal(utc.tz, 'UTC')
  assert.equal(utc.since, '2026-05-01T00:00:00.000Z')
})

test('series keep the top 8 by cost, fold the rest into __others__, and name empty values', () => {
  const db = freshDb()
  const now = Date.parse('2026-05-01T12:00:00Z')
  const at = '2026-05-01T10:00:00.000Z'
  const rows = []
  for (let i = 1; i <= 10; i++) rows.push({ created_at: at, model: `m${i}`, total_cost: i, input_tokens: 10 })
  rows.push({ created_at: at, model: null, total_cost: 20 })
  seed(db, rows)
  const data = new StatisticsRepo(db).statistics({ range: 'today', dimension: 'model', tz: 'UTC', now })
  assert.deepEqual(
    data.series.map((s) => s.id),
    ['__none__', 'm10', 'm9', 'm8', 'm7', 'm6', 'm5', 'm4', '__others__'],
  )
  assert.equal(data.series[0].name, '未知')
  assert.deepEqual(
    data.series.map((s) => s.dataKey),
    ['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'],
  )
  // m1 + m2 + m3 land in others.
  assert.deepEqual(data.seriesTotals.s8, { cost: 6, requests: 3, tokens: 30 })
  const hour10 = data.metrics.requests.find((p) => p.date === at)
  assert.equal(hour10.s8, 3)
  assert.equal(data.metrics.requests[0].s8, 0)
  assert.equal(data.totals.requests, 11)
})

test('deltas compare with the previous equal-length window', () => {
  const db = freshDb()
  const now = Date.parse('2026-05-08T12:00:00Z')
  // 7days window = [2026-05-02, now); previous = same span ending 2026-05-02.
  seed(db, [
    { created_at: '2026-05-05T00:00:00.000Z', total_cost: 3, input_tokens: 30 },
    { created_at: '2026-05-06T00:00:00.000Z', total_cost: 3, input_tokens: 30 },
    { created_at: '2026-04-28T00:00:00.000Z', total_cost: 2, input_tokens: 40 },
  ])
  const data = new StatisticsRepo(db).statistics({ range: '7days', tz: 'UTC', now })
  assert.equal(data.deltas.requests, 1)
  assert.equal(data.deltas.cost, 2)
  assert.equal(data.deltas.tokens, 0.5)
  const empty = new StatisticsRepo(db).statistics({ range: 'today', tz: 'UTC', now })
  assert.equal(empty.deltas.requests, null)
})

test('leaderboard sorts by official cost, names entities, and caps the limit', () => {
  const db = freshDb()
  const now = Date.parse('2026-05-01T12:00:00Z')
  const at = '2026-05-01T09:00:00.000Z'
  seed(db, [
    {
      created_at: at,
      user_id: 'u1',
      api_key_id: 'k1',
      total_cost: 1,
      actual_cost: 2,
      input_tokens: 80,
      cache_read_tokens: 20,
    },
    { created_at: at, user_id: 'u1', api_key_id: 'k1', total_cost: 1, status: 500, error_code: 'upstream_error' },
    { created_at: at, user_id: 'u2', api_key_id: 'k2', total_cost: 5, duration_ms: 100 },
    { created_at: at, user_id: null, api_key_id: null, total_cost: 0.5 },
  ])
  const repo = new StatisticsRepo(db)
  const board = repo.leaderboard({ range: 'today', scope: 'user', tz: 'UTC', now })
  assert.deepEqual(
    board.entries.map((e) => [e.id, e.name]),
    [
      ['u2', 'bob'],
      ['u1', 'alice'],
      ['__none__', '未知'],
    ],
  )
  const alice = board.entries[1]
  assert.equal(alice.totalRequests, 2)
  assert.equal(alice.successRequests, 1)
  assert.equal(alice.errorRequests, 1)
  assert.equal(alice.successRate, 0.5)
  assert.equal(alice.totalActualCost, 2)
  assert.equal(alice.cacheHitRate, 0.2)
  assert.equal(repo.leaderboard({ range: 'today', scope: 'key', limit: 1, tz: 'UTC', now }).entries[0].name, 'bob-key')
  assert.equal(repo.leaderboard({ range: 'today', scope: 'key', limit: 500, tz: 'UTC', now }).entries.length, 3)
})

test('panel routes owner-scope statistics for users and reject user/vm groupings', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kin-stats-route-'))
  const db = openDatabase({ dbPath: path.join(dir, 'panel.db') })
  try {
    seedUsers(db)
    const at = new Date(Date.now() - 1000).toISOString()
    seed(db, [
      { created_at: at, user_id: 'u1', api_key_id: 'k1', total_cost: 1 },
      { created_at: at, user_id: 'u2', api_key_id: 'k2', total_cost: 7 },
    ])
    const call = async (role, url) => {
      const response = {}
      const handle = createPanelHandler({
        cfg: { paths: { project: dir } },
        requireAuth(req) {
          req.panelUser = role
          req.panelRole = role
          req.panelUserId = 'u1'
          return true
        },
        json(_res, status, body) {
          response.status = status
          response.body = body
          return true
        },
      })
      await handle({ method: 'GET', url, headers: {} }, {}, new URL(`http://localhost${url}`))
      return response
    }
    assert.equal((await call('user', '/api/panel/statistics?dimension=user')).status, 400)
    assert.equal((await call('user', '/api/panel/statistics/leaderboard?scope=vm')).status, 400)
    assert.equal((await call('admin', '/api/panel/statistics?range=never')).status, 400)

    const mine = await call('user', '/api/panel/statistics/leaderboard?scope=key&range=today&user_id=u2')
    assert.equal(mine.status, 200)
    assert.deepEqual(
      mine.body.data.entries.map((e) => e.id),
      ['k1'],
    )
    const all = await call('admin', '/api/panel/statistics?dimension=user&range=today')
    assert.equal(all.status, 200)
    assert.equal(all.body.data.totals.cost, 8)
  } finally {
    closeDatabase()
  }
})
