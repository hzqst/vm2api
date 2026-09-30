import { test } from 'node:test'
import assert from 'node:assert/strict'
import { xxh64 } from '../../src/lib/identity/xxh64.mjs'

test('xxh64 empty string with seed 0 matches reference vector', () => {
  assert.equal(xxh64(''), 0xef46db3751d8e999n)
})

test('xxh64 produces deterministic output for identical input', () => {
  assert.equal(xxh64('hello'), xxh64('hello'))
  assert.notEqual(xxh64('hello'), xxh64('world'))
})

test('xxh64 handles single-byte input', () => {
  assert.equal(xxh64('a'), 0xd24ec4f1a98c6e5bn)
})

test('xxh64 handles multi-byte input (3 bytes)', () => {
  assert.equal(xxh64('abc'), 0x44bc2cf5ad770999n)
})

test('xxh64 seed changes the digest', () => {
  assert.notEqual(xxh64('a', 0n), xxh64('a', 1n))
  assert.equal(xxh64('a', 1n), 0xdec2bc81c3cd46c6n)
})

test('xxh64 handles input at 32-byte boundary (block path)', () => {
  const s32 = 'a'.repeat(32)
  assert.equal(xxh64(s32), 0x856e843298f99ad7n)
})

test('xxh64 handles input > 32 bytes (multiple blocks)', () => {
  const s64 = 'a'.repeat(64)
  assert.equal(xxh64(s64), 0xecdb66a0aa9322e2n)
})

test('xxh64 accepts Buffer input', () => {
  assert.equal(xxh64(Buffer.from('abc')), 0x44bc2cf5ad770999n)
})

test('xxh64 accepts Uint8Array input', () => {
  assert.equal(xxh64(new Uint8Array([97, 98, 99])), 0x44bc2cf5ad770999n)
})

test('xxh64 null/undefined input is treated as empty', () => {
  assert.equal(xxh64(null), 0xef46db3751d8e999n)
  assert.equal(xxh64(undefined), 0xef46db3751d8e999n)
})

test('xxh64 numeric seed is coerced to bigint', () => {
  assert.equal(xxh64('a', 0), xxh64('a', 0n))
  assert.equal(xxh64('a', 1), xxh64('a', 1n))
})
