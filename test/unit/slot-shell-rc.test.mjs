import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { panelShellLaunch } from '../../src/lib/vm/slot-shell.mjs'

test('claude in the panel shell runs cli-node and points config at .claude', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slot-shell-rc-'))
  const bin = path.join(dir, 'cli-node')
  const decoyDir = path.join(dir, 'decoy')
  const home = path.join(dir, 'home')
  fs.mkdirSync(decoyDir)
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(home, '.claude', 'credentials.json'), '{}\n')
  fs.writeFileSync(path.join(home, '.claude', '.claude.json'), '{"oauthAccount":{}}\n')
  fs.writeFileSync(bin, '#!/bin/sh\necho "cli-node $*"\n', { mode: 0o755 })
  fs.writeFileSync(path.join(decoyDir, 'claude'), '#!/bin/sh\necho DECOY\n', { mode: 0o755 })
  const { rc, cmd } = panelShellLaunch(bin)
  assert.match(cmd.at(-1), /bash --rcfile/)
  assert.match(rc, /CLAUDE_CONFIG_DIR/)
  const rcPath = path.join(dir, 'rc')
  fs.writeFileSync(rcPath, `${rc}\n`)
  const ran = spawnSync(
    'bash',
    ['--rcfile', rcPath, '-ic', 'type claude; printf %s "$CLAUDE_CONFIG_DIR"; echo; claude --flag'],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: home,
        PATH: `${decoyDir}:${process.env.PATH}`,
        KIN_PANEL_RCFILE: rcPath,
      },
    },
  )
  assert.equal(ran.status, 0, ran.stderr)
  assert.match(ran.stdout, /claude is a function/)
  assert.match(ran.stdout, /cli-node --flag/)
  assert.doesNotMatch(ran.stdout, /DECOY/)
  assert.equal(fs.readlinkSync(path.join(home, '.claude', '.credentials.json')), 'credentials.json')
  assert.equal(fs.readlinkSync(path.join(home, '.claude.json')), '.claude/.claude.json')
  fs.rmSync(dir, { recursive: true, force: true })
})

test('panelShellLaunch rejects a non-absolute cli-node path', () => {
  assert.throws(() => panelShellLaunch('cli-node'), /invalid cli-node path/)
  assert.throws(() => panelShellLaunch('/tmp/a\nb'), /invalid cli-node path/)
})
