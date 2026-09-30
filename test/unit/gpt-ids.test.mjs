import test from 'node:test'
import assert from 'node:assert/strict'
import { SKIP_GPT, GPT_ID_PREFIX, isGptSeriesId, isSyncableGptCatalogId } from '../../src/lib/protocol/gpt-ids.mjs'

test('GPT_ID_PREFIX matches gpt prefix case-insensitively', () => {
  assert.ok(GPT_ID_PREFIX.test('gpt-4'))
  assert.ok(GPT_ID_PREFIX.test('GPT-4o'))
  assert.ok(!GPT_ID_PREFIX.test('claude-sonnet-5'))
})

test('SKIP_GPT matches non-chat model prefixes', () => {
  assert.ok(SKIP_GPT.test('whisper-1'))
  assert.ok(SKIP_GPT.test('tts-1'))
  assert.ok(SKIP_GPT.test('dall-e-3'))
  assert.ok(SKIP_GPT.test('text-embedding-3-small'))
  assert.ok(SKIP_GPT.test('text-moderation-latest'))
  assert.ok(!SKIP_GPT.test('gpt-4o'))
})

test('isGptSeriesId returns true for gpt chat models', () => {
  assert.equal(isGptSeriesId('gpt-4o'), true)
  assert.equal(isGptSeriesId('gpt-4.1'), true)
  assert.equal(isGptSeriesId('gpt-5'), true)
  assert.equal(isGptSeriesId('GPT-4o'), true)
})

test('isGptSeriesId returns false for non-gpt models', () => {
  assert.equal(isGptSeriesId('claude-sonnet-5'), false)
  assert.equal(isGptSeriesId('o1'), false)
  assert.equal(isGptSeriesId(''), false)
  assert.equal(isGptSeriesId(null), false)
  assert.equal(isGptSeriesId(undefined), false)
})

test('isGptSeriesId returns false for skipped gpt-prefixed models', () => {
  assert.equal(isGptSeriesId('gpt-image-1'), false)
  assert.equal(isGptSeriesId('chatgpt-image-1'), false)
})

test('isSyncableGptCatalogId returns true for normal gpt models', () => {
  assert.equal(isSyncableGptCatalogId('gpt-4o'), true)
  assert.equal(isSyncableGptCatalogId('gpt-4.1-mini'), true)
})

test('isSyncableGptCatalogId returns false for non-gpt ids', () => {
  assert.equal(isSyncableGptCatalogId('claude-sonnet-5'), false)
  assert.equal(isSyncableGptCatalogId(''), false)
})

test('isSyncableGptCatalogId rejects luna-wm variants', () => {
  assert.equal(isSyncableGptCatalogId('gpt-6-luna-wm'), false)
})

test('isSyncableGptCatalogId rejects wm as its own segment only', () => {
  assert.equal(isSyncableGptCatalogId('gpt-4-wm'), false)
  assert.equal(isSyncableGptCatalogId('gpt-4_wm'), false)
  assert.equal(isSyncableGptCatalogId('gpt-wm-4'), false)
  assert.equal(isSyncableGptCatalogId('gpt-4wm'), true)
})

test('isSyncableGptCatalogId allows gpt-6-luna (official model)', () => {
  // gpt-6-luna is a real model, only luna-wm is blocked
  assert.equal(isSyncableGptCatalogId('gpt-6-luna'), true)
})
