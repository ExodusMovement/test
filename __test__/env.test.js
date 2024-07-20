import { test } from '@exodus/test/node'
import assert from 'node:assert/strict'

test('Default NODE_ENV is "test"', () => {
  assert.equal(process.env.NODE_ENV, 'test')
})
