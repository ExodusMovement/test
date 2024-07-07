import {
  mock,
  describe,
  beforeEach,
  afterEach,
  before as beforeAll,
  after as afterAll,
  test,
  it,
} from 'node:test'

import assert from 'node:assert/strict'
import { format } from 'node:util'
import { jestfn } from './jest.fn.js'

const makeEach = (impl) => (list) => (template, fn) => {
  for (const args of list) {
    let name = template

    if (!args || typeof args === 'string' || typeof args === 'number') {
      name = format(name, args)
    } else {
      for (const [key, value] of Object.entries(args)) {
        name = name.replace(`$${key}`, value) // can collide but we don't care much yet
      }

      if (Array.isArray(args)) {
        name = format(name, ...args)
      }
    }

    impl(name, () => (Array.isArray(args) ? fn(...args) : fn(args)))
  }
}

describe.each = makeEach(describe)
test.each = makeEach(test)
it.each = makeEach(it)

const [major, minor] = process.versions.node.split('.').map(Number)

const assertHaveTimers = () =>
  assert(mock.timers, 'Timer mocking requires Node.js >=20.4.0 || 18 >=18.19.0')

let timersWarned = false
const warnOldTimers = () => {
  if (timersWarned) return
  timersWarned = true
  const ok = major >= 22 || (major === 20 && minor >= 11)
  if (!ok) console.warn('Warning: timer mocks are known to be glitchy before Node.js >=20.11.0')
}

const jest = {
  fn: (impl) => jestfn(impl), // hide extra arguments
  spyOn: (obj, name) => {
    assert(Object.hasOwn(obj, name))
    const fn = jestfn(obj[name], obj, name)
    // eslint-disable-next-line @exodus/mutable/no-param-reassign-prop-only
    obj[name] = fn
    return fn
  },
  useRealTimers: () => mock.timers.reset(),
  useFakeTimers: () => {
    assertHaveTimers()
    warnOldTimers()
    try {
      mock.timers.enable()
    } catch (e) {
      // We allow calling this multiple times and swallow the "MockTimers is already enabled!" error
      if (e.code !== 'ERR_INVALID_STATE') throw e
    }
  },
  runAllTimers: () => {
    assertHaveTimers()
    warnOldTimers()
    mock.timers.tick(100_000_000_000) // > 3 years
  },
  runOnlyPendingTimers: () => {
    const noInfiniteLoopBug = major >= 22 || (major === 20 && minor >= 11)
    assert(noInfiniteLoopBug, 'runOnlyPendingTimers requires Node.js >=20.11.0')
    mock.timers.runAll()
  },
  advanceTimersByTime: (time) => {
    assertHaveTimers()
    warnOldTimers()
    mock.timers.tick(time)
  },
  advanceTimersByTimeAsync: async (time) => jest.advanceTimersByTime(time),
}

function tap(name, fn) {
  test(name, () =>
    fn({
      ...assert,
      pass: (name) => it(true, name),
      end: () => {},
    })
  )
}

if (mock.module) {
  const jestGlobals = { jest, describe, it, beforeEach, afterEach, beforeAll, afterAll }
  mock.module('@jest/globals', { defaultExport: jestGlobals, namedExports: jestGlobals })
}

export { tap, jest }
export { expect } from 'expect'
export {
  mock,
  beforeEach,
  before,
  afterEach,
  after,
  before as beforeAll,
  after as afterAll,
  describe,
  test,
  it,
} from 'node:test'

export { default as assert } from 'node:assert/strict'
