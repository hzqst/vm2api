import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  parseChangelog,
  changelogSince,
  compareSemver,
  normalizeTag,
  parseReleaseTag,
  imageTagFor,
  readLocalVersion,
  loadChangelog,
  publicRelease,
  buildUpdateStatus,
  startHostUpgrade,
  upgradeCommand,
  clearReleaseCache,
  INSTALL_SCRIPT_URL,
} from '../../src/lib/admin/release.mjs'

const FIXTURE = `# Changelog

## Unreleased

- draft note

## 1.2.7 — 2026-09-21

控制面一键更新。

- 一键脚本
- 面板更新检查

## 1.2.6 — 2026-09-20

控制面：本地出口导入。不必换槽内 kernel。

- 本地出口绑槽后允许导入
- 已部署机升级：只更新控制面 Node

## 1.2.5 — 2026-09-20

仓内预编译。

- 已部署机升级：控制面重启一次 + \`POST /api/panel/wrap-cli/sync\` 换槽内 CLI
`

test('parseChangelog reads Keep-a-Changelog headings and wrap-cli flag', () => {
  const entries = parseChangelog(FIXTURE)
  assert.equal(entries[0].version, 'unreleased')
  assert.equal(entries[1].version, '1.2.7')
  assert.equal(entries[1].date, '2026-09-21')
  assert.equal(entries[1].title, '控制面一键更新。')
  assert.deepEqual(entries[1].bullets, ['一键脚本', '面板更新检查'])
  assert.equal(entries[2].needs_wrap_cli_sync, false)
  assert.equal(entries[3].needs_wrap_cli_sync, true)
})

test('changelogSince returns only newer released versions', () => {
  const newer = changelogSince(parseChangelog(FIXTURE), '1.2.6')
  assert.deepEqual(
    newer.map((e) => e.version),
    ['1.2.7'],
  )
  assert.equal(changelogSince(parseChangelog(FIXTURE), '1.2.7').length, 0)
})

test('compareSemver orders dotted triples', () => {
  assert.equal(compareSemver('1.2.7', '1.2.6'), 1)
  assert.equal(compareSemver('v1.2.6', '1.2.6'), 0)
  assert.equal(compareSemver('1.1.9', '1.2.0'), -1)
  assert.equal(normalizeTag('1.2.6'), 'v1.2.6')
})

test('readLocalVersion prefers VERSION file over package.json', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vm2api-release-'))
  try {
    fs.writeFileSync(path.join(tmp, 'VERSION'), '1.2.6\n')
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ version: '0.0.1' }))
    assert.equal(readLocalVersion(tmp), '1.2.6')
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

test('loadChangelog reads the warehouse CHANGELOG.md', () => {
  const entries = loadChangelog(path.resolve(import.meta.dirname, '../..'))
  assert.ok(entries.length >= 3)
  assert.equal(
    entries.some((e) => e.version === '1.2.6'),
    true,
  )
  assert.equal(
    entries.some((e) => e.version === '1.0.0'),
    true,
  )
})

test('buildUpdateStatus reports an available GitHub release and the one-click command', async () => {
  clearReleaseCache()
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vm2api-release-'))
  try {
    fs.writeFileSync(path.join(tmp, 'VERSION'), '1.2.6\n')
    fs.writeFileSync(path.join(tmp, 'CHANGELOG.md'), FIXTURE)
    const status = await buildUpdateStatus({
      projectRoot: tmp,
      cacheMs: 0,
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          tag_name: 'v1.2.7',
          name: 'vm2api v1.2.7',
          html_url: 'https://github.com/dofastted/vm2api/releases/tag/v1.2.7',
          published_at: '2026-09-21T00:00:00Z',
          body: '一键更新',
        }),
      }),
    })
    assert.equal(status.current, '1.2.6')
    assert.equal(status.latest, '1.2.7')
    assert.equal(status.update_available, true)
    assert.equal(status.changelog[0].version, '1.2.7')
    assert.match(status.upgrade_command, new RegExp(INSTALL_SCRIPT_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.match(status.upgrade_command, /upgrade --version v1\.2\.7/)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
    clearReleaseCache()
  }
})

test('buildUpdateStatus stays on current when GitHub is unreachable', async () => {
  clearReleaseCache()
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vm2api-release-'))
  try {
    fs.writeFileSync(path.join(tmp, 'VERSION'), '1.2.6\n')
    fs.writeFileSync(path.join(tmp, 'CHANGELOG.md'), FIXTURE)
    const status = await buildUpdateStatus({
      projectRoot: tmp,
      cacheMs: 0,
      fetchImpl: async () => {
        throw new Error('network down')
      },
    })
    assert.equal(status.current, '1.2.6')
    assert.equal(status.latest, '1.2.6')
    assert.equal(status.update_available, false)
    assert.equal(status.source_error, 'network down')
    assert.equal(status.changelog[0].version, '1.2.7')
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
    clearReleaseCache()
  }
})

test('startHostUpgrade without confirm only returns the command', async () => {
  clearReleaseCache()
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vm2api-release-'))
  try {
    fs.writeFileSync(path.join(tmp, 'VERSION'), '1.2.6\n')
    fs.writeFileSync(path.join(tmp, 'CHANGELOG.md'), FIXTURE)
    const result = await startHostUpgrade({
      projectRoot: tmp,
      confirm: false,
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ tag_name: 'v1.2.7', body: '' }),
      }),
      spawnImpl() {
        throw new Error('should not spawn')
      },
    })
    assert.equal(result.status, 200)
    assert.equal(result.data.started, false)
    assert.equal(result.data.target, 'v1.2.7')
    assert.equal(result.data.command, upgradeCommand('v1.2.7'))
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
    clearReleaseCache()
  }
})

test('startHostUpgrade with confirm spawns a detached docker helper', async () => {
  clearReleaseCache()
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vm2api-release-'))
  const spawned = []
  try {
    fs.writeFileSync(path.join(tmp, 'VERSION'), '1.2.6\n')
    fs.writeFileSync(path.join(tmp, 'CHANGELOG.md'), FIXTURE)
    const result = await startHostUpgrade({
      projectRoot: tmp,
      confirm: true,
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ tag_name: 'v1.2.7', body: '' }),
      }),
      spawnImpl(cmd, args, opts) {
        spawned.push({ cmd, args, opts })
        return { unref() {} }
      },
    })
    if (result.status === 409) {
      assert.equal(result.error.code, 'host_upgrade_required')
      assert.match(result.error.command, /upgrade --version v1\.2\.7/)
      return
    }
    assert.equal(result.status, 202)
    assert.equal(result.data.started, true)
    assert.equal(spawned.length, 1)
    assert.equal(spawned[0].opts.detached, true)
    assert.ok(spawned[0].args.includes('vm2api-upgrade'))
    assert.ok(spawned[0].args.includes('docker:27-cli'))
    const script = spawned[0].args[spawned[0].args.indexOf('sh') + 2] || spawned[0].args.join(' ')
    assert.match(String(script), /!CHANGELOG\.md/)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
    clearReleaseCache()
  }
})

test('publicRelease ignores malformed GitHub payloads', () => {
  assert.equal(publicRelease(null), null)
  assert.equal(publicRelease({ tag_name: 'nightly' }), null)
  assert.equal(publicRelease({ tag_name: 'v1.2.7; rm -rf /' }), null)
  assert.equal(publicRelease({ tag_name: 'v1.2.7' }).version, '1.2.7')
})

test('VERSION is the only application release version source', () => {
  const root = path.resolve(import.meta.dirname, '../..')
  const version = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim()
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'))
  const compose = fs.readFileSync(path.join(root, 'docker-compose.yml'), 'utf8')
  const vite = fs.readFileSync(path.join(root, 'web', 'vite.config.ts'), 'utf8')

  assert.match(version, /^\d+\.\d+\.\d+$/)
  assert.equal(Object.hasOwn(pkg, 'version'), false)
  assert.equal(Object.hasOwn(lock, 'version'), false)
  assert.equal(Object.hasOwn(lock.packages[''], 'version'), false)
  assert.doesNotMatch(compose, /image:\s*vm2api:[^\s]+/)
  assert.doesNotMatch(vite, /__APP_VERSION__|readFileSync/)
})

test('startHostUpgrade rejects non-semver targets', async () => {
  const result = await startHostUpgrade({
    confirm: true,
    version: 'v1.2.6; touch /tmp/pwned',
    spawnImpl() {
      throw new Error('should not spawn')
    },
  })
  assert.equal(result.status, 400)
  assert.equal(result.error.code, 'invalid_version')
})

test('release tags carry an optional architecture suffix that is cleaned and recognized', () => {
  assert.deepEqual(parseReleaseTag('v1.2.7'), { version: '1.2.7', tag: 'v1.2.7', arch: '' })
  assert.deepEqual(parseReleaseTag('1.2.7-aarch64'), { version: '1.2.7', tag: 'v1.2.7', arch: 'arm64' })
  assert.deepEqual(parseReleaseTag('v1.2.7-X86_64'), { version: '1.2.7', tag: 'v1.2.7', arch: 'amd64' })
  assert.equal(parseReleaseTag('v1.2.7-riscv64'), null)
  assert.equal(parseReleaseTag('v1.2.7-arm64; rm -rf /'), null)
  assert.equal(normalizeTag('v1.2.7-arm64'), 'v1.2.7')
  assert.equal(imageTagFor('v1.2.7', 'x64'), 'v1.2.7')
  assert.equal(imageTagFor('v1.2.7-arm64', 'arm64'), 'v1.2.7-arm64')
  assert.equal(imageTagFor('v1.2.7', 'aarch64'), 'v1.2.7-arm64')
  assert.equal(imageTagFor('v1.2.7', 'ppc64'), '')
})

test('startHostUpgrade rejects a suffix for another architecture before spawning', async () => {
  const result = await startHostUpgrade({
    confirm: true,
    version: 'v1.2.7-amd64',
    arch: 'arm64',
    spawnImpl() {
      throw new Error('should not spawn')
    },
  })
  assert.equal(result.status, 400)
  assert.equal(result.error.code, 'arch_mismatch')
})

test('ARM64 host upgrade pins the arm64 image and refuses a source tree without the override', async () => {
  clearReleaseCache()
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vm2api-release-'))
  const spawned = []
  try {
    fs.writeFileSync(path.join(tmp, 'VERSION'), '1.2.6\n')
    fs.writeFileSync(path.join(tmp, 'CHANGELOG.md'), FIXTURE)
    const result = await startHostUpgrade({
      projectRoot: tmp,
      confirm: true,
      version: 'v1.2.7-arm64',
      arch: 'arm64',
      fetchImpl: async () => ({ ok: true, json: async () => ({ tag_name: 'v1.2.7', body: '' }) }),
      spawnImpl(cmd, args, opts) {
        spawned.push({ cmd, args, opts })
        return { unref() {} }
      },
    })
    if (result.status === 409) return
    assert.equal(result.status, 202)
    assert.equal(result.data.target, 'v1.2.7')
    const script = spawned[0].args[spawned[0].args.indexOf('-c') + 1]
    assert.match(script, /^TAG=v1\.2\.7$/m)
    assert.match(script, /^IMAGE_TAG=v1\.2\.7-arm64$/m)
    assert.match(script, /VM2API_IMAGE_TAG=\$IMAGE_TAG/)
    assert.ok(script.indexOf('docker-compose.arm64.yml') < script.indexOf('git checkout'))
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
    clearReleaseCache()
  }
})
