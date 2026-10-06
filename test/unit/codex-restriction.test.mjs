import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyCodexClient, restrictCodexClient } from '../../src/lib/protocol/codex-restriction.mjs'
import { normalizeCodexRouting } from '../../src/lib/protocol/codex-route.mjs'

const routing = { codex: normalizeCodexRouting() }

test('official Codex CLI is allowed', () => {
  const headers = { 'user-agent': 'codex_cli_rs/0.160.0 (linux x86_64)', 'x-codex-installation-id': 'dev-1' }
  assert.equal(classifyCodexClient(headers, {}), 'official_codex')
  assert.equal(restrictCodexClient(headers, {}, routing).ok, true)
})

test('Claude Code is rejected on Codex hop', () => {
  const headers = { 'user-agent': 'claude-cli/2.1.234' }
  const result = restrictCodexClient(headers, {}, routing)
  assert.equal(result.ok, false)
  assert.equal(result.kind, 'claude_code')
  assert.equal(result.code, 'client_not_allowed')
})

test('third-party OpenAI clients are allowed', () => {
  const curl = restrictCodexClient(
    { 'user-agent': 'curl/8.0' },
    { messages: [{ role: 'user', content: 'hi' }] },
    routing,
    'openai.chat',
  )
  assert.equal(curl.ok, true)
  assert.equal(curl.kind, 'openai_compatible')
  const unknown = restrictCodexClient({ 'user-agent': 'curl/8.0' }, {}, routing)
  assert.equal(unknown.ok, true)
})

test('real Codex CLI user agents classify as official_codex', () => {
  for (const ua of [
    'codex_cli_rs/0.46.0 (Ubuntu 22.04; x86_64) xterm-256color',
    'codex_exec/0.46.0 (Mac OS 15.1; arm64)',
    'codex_vscode/0.1.0',
  ]) {
    assert.equal(classifyCodexClient({ 'user-agent': ua }, { input: [] }, 'openai.responses'), 'official_codex', ua)
  }
  assert.equal(
    classifyCodexClient({ 'user-agent': 'x', originator: 'codex_cli_rs' }, { input: [] }, 'openai.responses'),
    'official_codex',
  )
  const blocked = restrictCodexClient(
    { 'user-agent': 'codex_cli_rs/0.46.0' },
    { input: [] },
    { codex: normalizeCodexRouting({ clients: { official_codex: 'reject' } }) },
    'openai.responses',
  )
  assert.equal(blocked.ok, false)
  assert.equal(
    classifyCodexClient({ 'user-agent': 'my-codex-helper/1.0' }, { input: [] }, 'openai.responses'),
    'openai_compatible',
  )
})
