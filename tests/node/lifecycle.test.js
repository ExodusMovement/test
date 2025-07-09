import { describe, test, after, afterEach, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

// Order of describe vs tests is checked
// Order of hooks vs tests is checked

// See also tests/jest/lifecycle.test.js

// Prior to 22.8, running *Each hooks in `describe { decribe { *Each; test }; *Each } }` is also not matched
// Prior to 20.13, relative afterEach order was not matched
// Prior to 18.19.0 / 20.8.0, lifecycle was significantly broken, so we don't run on those

const expected = {
  testlog: [
    { callsite: 'installBunch', site: 0 },
    { enter: 'A' },
    { callsite: 'installBunch', site: 1 },
    { enter: 'B' },
    { callsite: 'installBunch', site: 2 },
    { callsite: 'installBunch', site: 3 },
    { exit: 'B' },
    { enter: 'E' },
    { callsite: 'installBunch', site: 4 },
    { callsite: 'installBunch', site: 5 },
    { enter: 'G' },
    { callsite: 'installBunch', site: 6 },
    { callsite: 'installBunch', site: 7 },
    { exit: 'G' },
    { exit: 'E' },
    { callsite: 'installBunch', site: 8 },
    { exit: 'A' },
    { enter: 'K' },
    { callsite: 'installBunch', site: 9 },
    { callsite: 'installBunch', site: 10 },
    { exit: 'K' },
    { run: 'C' },
    { run: 'D' },
    { run: 'F' },
    { run: 'H' },
    { run: 'I' },
    { run: 'J' },
    { run: 'L' },
  ],
  hooklog: [
    { callsite: 'installBunch', site: 0 },
    { callsite: 'installBunch', site: 1 },
    { callsite: 'installBunch', site: 2 },
    { callsite: 'installBunch', site: 3 },
    { callsite: 'installBunch', site: 4 },
    { callsite: 'installBunch', site: 5 },
    { callsite: 'installBunch', site: 6 },
    { callsite: 'installBunch', site: 7 },
    { callsite: 'installBunch', site: 8 },
    { callsite: 'installBunch', site: 9 },
    { callsite: 'installBunch', site: 10 },
    { site: 1, installOrder: 7, method: 'before' },
    { site: 1, installOrder: 10, method: 'before' },
    { site: 8, installOrder: 63, method: 'before' },
    { site: 8, installOrder: 66, method: 'before' },
    { site: 2, installOrder: 15, method: 'before' },
    { site: 2, installOrder: 18, method: 'before' },
    { site: 3, installOrder: 23, method: 'before' },
    { site: 3, installOrder: 26, method: 'before' },
    { site: 0, installOrder: 1, method: 'beforeEach' },
    { site: 0, installOrder: 4, method: 'beforeEach' },
    { site: 1, installOrder: 8, method: 'beforeEach' },
    { site: 1, installOrder: 12, method: 'beforeEach' },
    { site: 8, installOrder: 64, method: 'beforeEach' },
    { site: 8, installOrder: 68, method: 'beforeEach' },
    { site: 2, installOrder: 16, method: 'beforeEach' },
    { site: 2, installOrder: 20, method: 'beforeEach' },
    { site: 3, installOrder: 24, method: 'beforeEach' },
    { site: 3, installOrder: 28, method: 'beforeEach' },
    { run: 'C' },
    { site: 2, installOrder: 17, method: 'afterEach' },
    { site: 2, installOrder: 19, method: 'afterEach' },
    { site: 3, installOrder: 25, method: 'afterEach' },
    { site: 3, installOrder: 27, method: 'afterEach' },
    { site: 1, installOrder: 9, method: 'afterEach' },
    { site: 1, installOrder: 11, method: 'afterEach' },
    { site: 8, installOrder: 65, method: 'afterEach' },
    { site: 8, installOrder: 67, method: 'afterEach' },
    { site: 0, installOrder: 2, method: 'afterEach' },
    { site: 0, installOrder: 3, method: 'afterEach' },
    { site: 0, installOrder: 1, method: 'beforeEach' },
    { site: 0, installOrder: 4, method: 'beforeEach' },
    { site: 1, installOrder: 8, method: 'beforeEach' },
    { site: 1, installOrder: 12, method: 'beforeEach' },
    { site: 8, installOrder: 64, method: 'beforeEach' },
    { site: 8, installOrder: 68, method: 'beforeEach' },
    { site: 2, installOrder: 16, method: 'beforeEach' },
    { site: 2, installOrder: 20, method: 'beforeEach' },
    { site: 3, installOrder: 24, method: 'beforeEach' },
    { site: 3, installOrder: 28, method: 'beforeEach' },
    { run: 'D' },
    { site: 2, installOrder: 17, method: 'afterEach' },
    { site: 2, installOrder: 19, method: 'afterEach' },
    { site: 3, installOrder: 25, method: 'afterEach' },
    { site: 3, installOrder: 27, method: 'afterEach' },
    { site: 1, installOrder: 9, method: 'afterEach' },
    { site: 1, installOrder: 11, method: 'afterEach' },
    { site: 8, installOrder: 65, method: 'afterEach' },
    { site: 8, installOrder: 67, method: 'afterEach' },
    { site: 0, installOrder: 2, method: 'afterEach' },
    { site: 0, installOrder: 3, method: 'afterEach' },
    { site: 2, installOrder: 14, method: 'after' },
    { site: 2, installOrder: 21, method: 'after' },
    { site: 3, installOrder: 22, method: 'after' },
    { site: 3, installOrder: 29, method: 'after' },
    { site: 4, installOrder: 31, method: 'before' },
    { site: 4, installOrder: 34, method: 'before' },
    { site: 5, installOrder: 39, method: 'before' },
    { site: 5, installOrder: 42, method: 'before' },
    { site: 0, installOrder: 1, method: 'beforeEach' },
    { site: 0, installOrder: 4, method: 'beforeEach' },
    { site: 1, installOrder: 8, method: 'beforeEach' },
    { site: 1, installOrder: 12, method: 'beforeEach' },
    { site: 8, installOrder: 64, method: 'beforeEach' },
    { site: 8, installOrder: 68, method: 'beforeEach' },
    { site: 4, installOrder: 32, method: 'beforeEach' },
    { site: 4, installOrder: 36, method: 'beforeEach' },
    { site: 5, installOrder: 40, method: 'beforeEach' },
    { site: 5, installOrder: 44, method: 'beforeEach' },
    { run: 'F' },
    { site: 4, installOrder: 33, method: 'afterEach' },
    { site: 4, installOrder: 35, method: 'afterEach' },
    { site: 5, installOrder: 41, method: 'afterEach' },
    { site: 5, installOrder: 43, method: 'afterEach' },
    { site: 1, installOrder: 9, method: 'afterEach' },
    { site: 1, installOrder: 11, method: 'afterEach' },
    { site: 8, installOrder: 65, method: 'afterEach' },
    { site: 8, installOrder: 67, method: 'afterEach' },
    { site: 0, installOrder: 2, method: 'afterEach' },
    { site: 0, installOrder: 3, method: 'afterEach' },
    { site: 6, installOrder: 47, method: 'before' },
    { site: 6, installOrder: 50, method: 'before' },
    { site: 7, installOrder: 55, method: 'before' },
    { site: 7, installOrder: 58, method: 'before' },
    { site: 0, installOrder: 1, method: 'beforeEach' },
    { site: 0, installOrder: 4, method: 'beforeEach' },
    { site: 1, installOrder: 8, method: 'beforeEach' },
    { site: 1, installOrder: 12, method: 'beforeEach' },
    { site: 8, installOrder: 64, method: 'beforeEach' },
    { site: 8, installOrder: 68, method: 'beforeEach' },
    { site: 4, installOrder: 32, method: 'beforeEach' },
    { site: 4, installOrder: 36, method: 'beforeEach' },
    { site: 5, installOrder: 40, method: 'beforeEach' },
    { site: 5, installOrder: 44, method: 'beforeEach' },
    { site: 6, installOrder: 48, method: 'beforeEach' },
    { site: 6, installOrder: 52, method: 'beforeEach' },
    { site: 7, installOrder: 56, method: 'beforeEach' },
    { site: 7, installOrder: 60, method: 'beforeEach' },
    { run: 'H' },
    { site: 6, installOrder: 49, method: 'afterEach' },
    { site: 6, installOrder: 51, method: 'afterEach' },
    { site: 7, installOrder: 57, method: 'afterEach' },
    { site: 7, installOrder: 59, method: 'afterEach' },
    { site: 4, installOrder: 33, method: 'afterEach' },
    { site: 4, installOrder: 35, method: 'afterEach' },
    { site: 5, installOrder: 41, method: 'afterEach' },
    { site: 5, installOrder: 43, method: 'afterEach' },
    { site: 1, installOrder: 9, method: 'afterEach' },
    { site: 1, installOrder: 11, method: 'afterEach' },
    { site: 8, installOrder: 65, method: 'afterEach' },
    { site: 8, installOrder: 67, method: 'afterEach' },
    { site: 0, installOrder: 2, method: 'afterEach' },
    { site: 0, installOrder: 3, method: 'afterEach' },
    { site: 6, installOrder: 46, method: 'after' },
    { site: 6, installOrder: 53, method: 'after' },
    { site: 7, installOrder: 54, method: 'after' },
    { site: 7, installOrder: 61, method: 'after' },
    { site: 4, installOrder: 30, method: 'after' },
    { site: 4, installOrder: 37, method: 'after' },
    { site: 5, installOrder: 38, method: 'after' },
    { site: 5, installOrder: 45, method: 'after' },
    { site: 0, installOrder: 1, method: 'beforeEach' },
    { site: 0, installOrder: 4, method: 'beforeEach' },
    { site: 1, installOrder: 8, method: 'beforeEach' },
    { site: 1, installOrder: 12, method: 'beforeEach' },
    { site: 8, installOrder: 64, method: 'beforeEach' },
    { site: 8, installOrder: 68, method: 'beforeEach' },
    { run: 'I' },
    { site: 1, installOrder: 9, method: 'afterEach' },
    { site: 1, installOrder: 11, method: 'afterEach' },
    { site: 8, installOrder: 65, method: 'afterEach' },
    { site: 8, installOrder: 67, method: 'afterEach' },
    { site: 0, installOrder: 2, method: 'afterEach' },
    { site: 0, installOrder: 3, method: 'afterEach' },
    { site: 1, installOrder: 6, method: 'after' },
    { site: 1, installOrder: 13, method: 'after' },
    { site: 8, installOrder: 62, method: 'after' },
    { site: 8, installOrder: 69, method: 'after' },
    { site: 0, installOrder: 1, method: 'beforeEach' },
    { site: 0, installOrder: 4, method: 'beforeEach' },
    { run: 'J' },
    { site: 0, installOrder: 2, method: 'afterEach' },
    { site: 0, installOrder: 3, method: 'afterEach' },
    { site: 9, installOrder: 71, method: 'before' },
    { site: 9, installOrder: 74, method: 'before' },
    { site: 10, installOrder: 79, method: 'before' },
    { site: 10, installOrder: 82, method: 'before' },
    { site: 0, installOrder: 1, method: 'beforeEach' },
    { site: 0, installOrder: 4, method: 'beforeEach' },
    { site: 9, installOrder: 72, method: 'beforeEach' },
    { site: 9, installOrder: 76, method: 'beforeEach' },
    { site: 10, installOrder: 80, method: 'beforeEach' },
    { site: 10, installOrder: 84, method: 'beforeEach' },
    { run: 'L' },
    { site: 9, installOrder: 73, method: 'afterEach' },
    { site: 9, installOrder: 75, method: 'afterEach' },
    { site: 10, installOrder: 81, method: 'afterEach' },
    { site: 10, installOrder: 83, method: 'afterEach' },
    { site: 0, installOrder: 2, method: 'afterEach' },
    { site: 0, installOrder: 3, method: 'afterEach' },
    { site: 9, installOrder: 70, method: 'after' },
    { site: 9, installOrder: 77, method: 'after' },
    { site: 10, installOrder: 78, method: 'after' },
    { site: 10, installOrder: 85, method: 'after' },
  ],
}

const testlog = []
const hooklog = []

after(() => {
  // console.log(testlog)
  // console.log(hooklog)

  // Flatten for readability
  const prettyJson = (line) => line.replaceAll('"', '').replaceAll(/([:,])/gu, '$1 ')
  const flatten = (x) => x.map((line) => prettyJson(JSON.stringify(line)))

  assert.deepStrictEqual(flatten(testlog), flatten(expected.testlog))

  // Reduce to compare before 22.8
  const reduceA = (x) => !(x.site === 8 && x.method?.endsWith('Each'))
  // Reduce second time to compare before 20.13
  const reduceB = (x) => reduceA(x) && x.method !== 'afterEach'

  assert.deepEqual(flatten(hooklog.filter(reduceB)), flatten(expected.hooklog.filter(reduceB)))

  const isNodeVersionOk = (a, b) => {
    if (!globalThis?.process?.versions?.node) return true
    if ((process.env.EXODUS_TEST_ENGINE || 'node:test') !== 'node:test') return true
    const [major, minor] = process.versions.node.split('.').map(Number)
    return major > a || (major === a && minor >= b)
  }

  // See comment on top
  if (isNodeVersionOk(20, 13)) {
    assert.deepEqual(flatten(hooklog.filter(reduceA)), flatten(expected.hooklog.filter(reduceA)))
  }

  if (isNodeVersionOk(22, 8)) assert.deepEqual(flatten(hooklog), flatten(expected.hooklog))
})

let i = 0 // automatic install order

// site is manual location site to be not affected by automatic order
function install(f, site, name = f.name) {
  const installOrder = i++
  if (f.name) assert(f.name === name)
  f(() => hooklog.push({ site, installOrder, method: name }))
}

const enter = (name) => testlog.push({ enter: name })
const exit = (name) => testlog.push({ exit: name })
const run = (name) => {
  hooklog.push({ run: name })
  testlog.push({ run: name })
}

const callsite = (name, args) => {
  hooklog.push({ callsite: name, ...args })
  testlog.push({ callsite: name, ...args })
}

const installBunch = (site, opts = {}) => {
  callsite('installBunch', { site })
  install(after, site, 'after')
  if (!opts.skipbefore) install(before, site, 'before')
  install(beforeEach, site, 'beforeEach')
  install(afterEach, site, 'afterEach')
  if (!opts.skipbefore) install(before, site, 'before')
  install(afterEach, site, 'afterEach')
  install(beforeEach, site, 'beforeEach')
  install(after, site, 'after')
}

installBunch(0, { skipbefore: true }) // Node executes this before() before describe blocks, unsure if intended, skip

describe('A', () => {
  enter('A')
  installBunch(1)

  describe('B', () => {
    enter('B')
    installBunch(2)
    test('C', () => run('C'))
    installBunch(3)
    test('D', () => run('D'))
    exit('B')
  })

  describe('E', () => {
    enter('E')
    installBunch(4)
    test('F', () => run('F'))
    installBunch(5)
    describe('G', () => {
      enter('G')
      installBunch(6)
      test('H', () => run('H'))
      installBunch(7)
      exit('G')
    })
    exit('E')
  })

  installBunch(8) // beforeEach/afterEach here is wrong in Node.js < 22.8.0

  test('I', () => run('I'))
  exit('A')
})

test('J', () => run('J'))

describe('K', () => {
  enter('K')
  installBunch(9)
  test('L', () => run('L'))
  installBunch(10)
  exit('K')
})
