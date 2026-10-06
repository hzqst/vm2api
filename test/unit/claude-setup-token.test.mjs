import test from 'node:test'
import assert from 'node:assert/strict'
import {
  extractSetupTokenAuthUrl,
  extractSetupTokenValue,
  isPersistentSetupTokenSession,
  looksLikeOfficialSetupToken,
  officialSetupTokenToOauth,
  pickPreferredSetupToken,
} from '../../src/lib/oauth/claude-setup-token.mjs'

test('extractSetupTokenAuthUrl reads OSC-8 hyperlink', () => {
  const url =
    'https://claude.com/cai/oauth/authorize?code=true&client_id=9d1c250a-e61b-44d9-88ed-5944d1962f5e&scope=user%3Ainference'
  const raw = `\x1b]8;id=x;${url}\x07https://claude.com/cai/oauth/authorize?code=true\x1b]8;;\x07`
  assert.equal(extractSetupTokenAuthUrl(raw), url)
})

test('extractSetupTokenAuthUrl joins wrapped plain text', () => {
  const raw = 'https://claude.com/cai/oauth/authorize?code=true&\nclient_id=abc&scope=user%3Ainference'
  assert.equal(
    extractSetupTokenAuthUrl(raw),
    'https://claude.com/cai/oauth/authorize?code=true&client_id=abc&scope=user%3Ainference',
  )
})

test('extractSetupTokenValue strips wrap and requires oat01', () => {
  const token = 'sk-ant-oat01-' + 'a'.repeat(90)
  const raw = `${token.slice(0, 70)}\n${token.slice(70)}`
  assert.equal(extractSetupTokenValue(raw), token)
  assert.equal(looksLikeOfficialSetupToken(token), true)
  assert.equal(looksLikeOfficialSetupToken('sk-ant-oat01-short'), false)
})

test('extractSetupTokenValue keeps dots and prefers official disk over a longer PTY glue', () => {
  const short = 'sk-ant-oat01-' + 'b'.repeat(90)
  const glued = short + '.' + 'c'.repeat(40)
  assert.equal(extractSetupTokenValue(`\x1b[32m${glued}\x1b[0m`), glued)
  assert.equal(pickPreferredSetupToken(short, glued, ''), short)
  assert.equal(pickPreferredSetupToken('', glued), glued)
})

test('extractSetupTokenValue strips ANSI around the oat', () => {
  const token = 'sk-ant-oat01-' + 'c'.repeat(90)
  const raw = `\x1b[33m${token}\x1b[39m`
  assert.equal(extractSetupTokenValue(raw), token)
})

test('officialSetupTokenToOauth is 1-year official-setup-token without refresh', () => {
  const token = 'sk-ant-oat01-' + 'b'.repeat(96)
  const oauth = officialSetupTokenToOauth(token)
  assert.equal(oauth.type, 'official-setup-token')
  assert.equal(oauth.mode, 'official-setup-token')
  assert.equal(oauth.access_token, token)
  assert.equal(oauth.refresh_token, '')
  assert.equal(oauth.scope, 'user:inference')
  assert.equal(oauth.source, 'claude-setup-token')

  assert.ok(oauth.expires_at > Date.now() + 360 * 24 * 60 * 60 * 1000)
  assert.throws(() => officialSetupTokenToOauth('sk-ant-ort01-nope'), /一年期/)
})

test('setup-token session stays reusable after a 400 until force regenerate', () => {
  const session = {
    alive: true,
    auth_url: 'https://claude.com/cai/oauth/authorize?code=true&client_id=x',
    expired: false,
    status: 'waiting_retry',
    code_fed: true,
    error: '官方 CLI 换票 400',
  }
  assert.equal(isPersistentSetupTokenSession(session), true)
  assert.equal(isPersistentSetupTokenSession(session, { force: true }), false)
  assert.equal(isPersistentSetupTokenSession({ ...session, alive: false }), false)
  assert.equal(isPersistentSetupTokenSession({ ...session, expired: true }), false)
})
