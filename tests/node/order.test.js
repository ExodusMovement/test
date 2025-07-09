import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

// A subset of lifecycle.test.js just ensuring proper test() execution order
// Bun fails even this as of v1.2.18

const expected = {
  testlog: [
    { run: 'C' },
    { run: 'D' },
    { run: 'F' },
    { run: 'H' },
    { run: 'I' },
    { run: 'J' },
    { run: 'L' },
  ],
}

const testlog = []

const run = (name) => testlog.push({ run: name })

describe('A', () => {
  describe('B', () => {
    test('C', () => run('C'))
    test('D', () => run('D'))
  })

  describe('E', () => {
    test('F', () => run('F'))
    describe('G', () => {
      test('H', () => run('H'))
    })
  })

  test('I', () => run('I'))
})

test('J', () => run('J'))

describe('K', () => {
  test('L', () => run('L'))
})

test('testlog', () => {
  // console.log(testlog)
  assert.deepStrictEqual(testlog, expected.testlog)
})
