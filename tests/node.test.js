import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

describe('example test', () => {
  test('first test', () => {
    assert.strictEqual(1, 1)
    assert.notStrictEqual(1, 2)
  })
})
