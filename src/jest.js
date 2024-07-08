import assert from 'node:assert/strict'
import { mock, describe, test, it } from 'node:test'
import { format } from 'node:util'
import { jestfn, allMocks } from './jest.fn.js'
import './jest.snapshot.js'

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
  clearAllMocks: () => allMocks.mockClear(),
  resetAllMocks: () => allMocks.mockReset(),
  restoreAllMocks: () => allMocks.mockRestore(),
  spyOn: (obj, name) => {
    assert(obj && name && name in obj && !(name in {}) && !(name in Object.prototype))
    const fn = jestfn(obj[name], obj, name)
    // eslint-disable-next-line @exodus/mutable/no-param-reassign-prop-only
    obj[name] = fn
    return fn
  },
  useRealTimers: () => {
    mock.timers.reset()
    return jest
  },
  useFakeTimers: ({ doNotFake = [], ...rest } = {}) => {
    assertHaveTimers()
    warnOldTimers()
    assert.deepEqual(rest, {}, 'Unsupported options')
    const allApis = ['setInterval', 'setTimeout', 'setImmediate', 'Date']
    for (const name of doNotFake) assert(allApis.includes(name), `Unknown API: ${name}`)
    const apis = allApis.filter((name) => !doNotFake.includes(name))
    try {
      mock.timers.enable({ apis })
    } catch (e) {
      // We allow calling this multiple times and swallow the "MockTimers is already enabled!" error
      if (e.code !== 'ERR_INVALID_STATE') throw e
    }

    return jest
  },
  runAllTimers: () => {
    assertHaveTimers()
    warnOldTimers()
    mock.timers.tick(100_000_000_000) // > 3 years
    return jest
  },
  runOnlyPendingTimers: () => {
    const noInfiniteLoopBug = major >= 22 || (major === 20 && minor >= 11)
    assert(noInfiniteLoopBug, 'runOnlyPendingTimers requires Node.js >=20.11.0')
    mock.timers.runAll()
    return jest
  },
  advanceTimersByTime: (time) => {
    assertHaveTimers()
    warnOldTimers()
    mock.timers.tick(time)
    return jest
  },
  advanceTimersByTimeAsync: async (time) => jest.advanceTimersByTime(time),
  setSystemTime: (time) => {
    mock.timers.setTime(+time)
    return jest
  },
}

export { jest }
export { expect } from 'expect'
export {
  beforeEach,
  afterEach,
  before as beforeAll,
  after as afterAll,
  describe,
  test,
  it,
} from 'node:test'
