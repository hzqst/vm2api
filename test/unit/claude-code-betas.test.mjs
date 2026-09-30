import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BETA_OAUTH,
  BETA_CLAUDE_CODE,
  BETA_INTERLEAVED,
  BETA_FINE_GRAINED_TOOLS,
  BETA_CONTEXT_MANAGEMENT,
  HAIKU_BETA_HEADER,
  DEFAULT_BETA_HEADER,
  API_KEY_BETAS,
  fullClaudeCodeMimicryBetas,
  defaultOfficialBetaHeader,
  joinBetas,
  stripOauthBeta,
  apiKeyBetaHeader,
  setupTokenBetaHeader,
  ensureMimicryBetas,
  ensureOauthBeta,
} from '../../src/lib/protocol/claude-code-betas.mjs'

test('fullClaudeCodeMimicryBetas returns the 13 official tokens in order', () => {
  const betas = fullClaudeCodeMimicryBetas()
  assert.equal(betas.length, 13)
  assert.equal(betas[0], BETA_CLAUDE_CODE)
  assert.equal(betas[1], BETA_OAUTH)
  assert.equal(betas[2], BETA_INTERLEAVED)
  // context-1m is never in the mimicry set
  assert.ok(!betas.includes('context-1m-2025-08-07'))
})

test('DEFAULT_BETA_HEADER is the comma-joined mimicry set', () => {
  assert.equal(DEFAULT_BETA_HEADER, fullClaudeCodeMimicryBetas().join(','))
  assert.ok(DEFAULT_BETA_HEADER.includes(BETA_OAUTH))
  assert.ok(DEFAULT_BETA_HEADER.includes(BETA_CLAUDE_CODE))
})

test('HAIKU_BETA_HEADER is oauth + interleaved only', () => {
  assert.equal(HAIKU_BETA_HEADER, `${BETA_OAUTH},${BETA_INTERLEAVED}`)
})

test('defaultOfficialBetaHeader picks haiku header for haiku models', () => {
  assert.equal(defaultOfficialBetaHeader('claude-haiku-4-5'), HAIKU_BETA_HEADER)
  assert.equal(defaultOfficialBetaHeader('claude-haiku-5'), HAIKU_BETA_HEADER)
  assert.equal(defaultOfficialBetaHeader('sonnet'), DEFAULT_BETA_HEADER)
  assert.equal(defaultOfficialBetaHeader(''), DEFAULT_BETA_HEADER)
  assert.equal(defaultOfficialBetaHeader(), DEFAULT_BETA_HEADER)
})

test('joinBetas filters falsy and joins with comma', () => {
  assert.equal(joinBetas(['a', '', 'b', null, 'c']), 'a,b,c')
  assert.equal(joinBetas([]), '')
  assert.equal(joinBetas(), '')
  assert.equal(joinBetas(['a']), 'a')
})

test('API_KEY_BETAS is claude-code + interleaved + fine-grained-tools', () => {
  assert.deepEqual(API_KEY_BETAS, [BETA_CLAUDE_CODE, BETA_INTERLEAVED, BETA_FINE_GRAINED_TOOLS])
})

test('stripOauthBeta removes oauth-2025-04-20 and trims whitespace', () => {
  assert.equal(stripOauthBeta(`${BETA_OAUTH},${BETA_INTERLEAVED}`), BETA_INTERLEAVED)
  assert.equal(
    stripOauthBeta(`${BETA_CLAUDE_CODE}, ${BETA_OAUTH} ,${BETA_INTERLEAVED}`),
    `${BETA_CLAUDE_CODE},${BETA_INTERLEAVED}`,
  )
  assert.equal(stripOauthBeta(BETA_OAUTH), '')
  assert.equal(stripOauthBeta(''), '')
  assert.equal(stripOauthBeta(), '')
  assert.equal(stripOauthBeta(BETA_CLAUDE_CODE), BETA_CLAUDE_CODE)
})

test('apiKeyBetaHeader strips oauth and falls back to API_KEY_BETAS when empty', () => {
  assert.equal(apiKeyBetaHeader(''), API_KEY_BETAS.join(','))
  assert.equal(apiKeyBetaHeader(), API_KEY_BETAS.join(','))
  assert.equal(apiKeyBetaHeader(BETA_OAUTH), API_KEY_BETAS.join(','))
  assert.equal(apiKeyBetaHeader(`${BETA_CLAUDE_CODE},${BETA_OAUTH}`), BETA_CLAUDE_CODE)
  assert.equal(apiKeyBetaHeader(`${BETA_CLAUDE_CODE},${BETA_INTERLEAVED}`), `${BETA_CLAUDE_CODE},${BETA_INTERLEAVED}`)
})

test('setupTokenBetaHeader uses haiku set for haiku models, otherwise oauth+interleaved+context-management', () => {
  assert.equal(setupTokenBetaHeader('claude-haiku-4-5'), HAIKU_BETA_HEADER)
  assert.equal(setupTokenBetaHeader('claude-sonnet-5'), `${BETA_OAUTH},${BETA_INTERLEAVED},${BETA_CONTEXT_MANAGEMENT}`)
  assert.equal(setupTokenBetaHeader(''), `${BETA_OAUTH},${BETA_INTERLEAVED},${BETA_CONTEXT_MANAGEMENT}`)
})

test('ensureMimicryBetas appends missing required tokens without duplicating', () => {
  // Empty header gets all required tokens
  assert.equal(ensureMimicryBetas(''), DEFAULT_BETA_HEADER)
  // Header already has the full set is unchanged
  assert.equal(ensureMimicryBetas(DEFAULT_BETA_HEADER), DEFAULT_BETA_HEADER)
  // Partial header gets the missing tokens appended
  const partial = `${BETA_CLAUDE_CODE},${BETA_OAUTH}`
  const result = ensureMimicryBetas(partial)
  assert.ok(result.startsWith(partial))
  assert.ok(result.includes(BETA_INTERLEAVED))
  // No duplicates
  const parts = result.split(',')
  assert.equal(parts.length, new Set(parts).size)
})

test('ensureMimicryBetas accepts a custom required set', () => {
  const custom = `${BETA_CLAUDE_CODE},${BETA_OAUTH}`
  assert.equal(ensureMimicryBetas(BETA_CLAUDE_CODE, custom), custom)
  assert.equal(ensureMimicryBetas('', BETA_OAUTH), BETA_OAUTH)
})

test('ensureOauthBeta inserts oauth after claude-code when present', () => {
  // Already has oauth: unchanged (after trim)
  assert.equal(
    ensureOauthBeta(`${BETA_CLAUDE_CODE},${BETA_OAUTH},${BETA_INTERLEAVED}`),
    `${BETA_CLAUDE_CODE},${BETA_OAUTH},${BETA_INTERLEAVED}`,
  )
  // claude-code present but oauth missing: insert after claude-code
  assert.equal(
    ensureOauthBeta(`${BETA_CLAUDE_CODE},${BETA_INTERLEAVED}`),
    `${BETA_CLAUDE_CODE},${BETA_OAUTH},${BETA_INTERLEAVED}`,
  )
  // No claude-code: prepend oauth
  assert.equal(
    ensureOauthBeta(`${BETA_INTERLEAVED},${BETA_CONTEXT_MANAGEMENT}`),
    `${BETA_OAUTH},${BETA_INTERLEAVED},${BETA_CONTEXT_MANAGEMENT}`,
  )
  // Empty header stays empty
  assert.equal(ensureOauthBeta(''), '')
  assert.equal(ensureOauthBeta(), '')
})
