import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

// A subset of lifecycle.test.js without after/before and friends
// Deno test runner has this wrong as of 2.4.0, it runs immediately before describe finished

const expected = {
  testlog: [
    { enter: 'A' },
    { enter: 'B' },
    { exit: 'B' },
    { enter: 'E' },
    { enter: 'G' },
    { exit: 'G' },
    { exit: 'E' },
    { exit: 'A' },
    { enter: 'K' },
    { exit: 'K' },
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

const enter = (name) => testlog.push({ enter: name })
const exit = (name) => testlog.push({ exit: name })
const run = (name) => testlog.push({ run: name })

describe('A', () => {
  enter('A')

  describe('B', () => {
    enter('B')
    test('C', () => run('C'))
    test('D', () => run('D'))
    exit('B')
  })

  describe('E', () => {
    enter('E')
    test('F', () => run('F'))
    describe('G', () => {
      enter('G')
      test('H', () => run('H'))
      exit('G')
    })
    exit('E')
  })

  test('I', () => run('I'))
  exit('A')
})

test('J', () => run('J'))

describe('K', () => {
  enter('K')
  test('L', () => run('L'))
  exit('K')
})

test('testlog', () => {
  // console.log(testlog)
  assert.deepStrictEqual(testlog, expected.testlog)
})
