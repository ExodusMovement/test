import { mock, describe, test, it } from 'node:test'
import { expect } from 'expect'
import assert from 'node:assert/strict'
import { format } from 'node:util'

const MockFunctionContext = mock.fn().mock.constructor

Object.defineProperties(MockFunctionContext.prototype, {
  // this getter is called just .calls in jest, we document this difference
  callsArguments: {
    get() {
      return this.calls.map((call) => call.arguments)
    },
  },
  lastCall: {
    get() {
      return this.calls.at(-1)?.arguments
    },
  },
  results: {
    get() {
      return this.calls.map((call) => ({ value: call.result }))
    },
  },
})

const mockImplementationOrig = MockFunctionContext.prototype.mockImplementation
MockFunctionContext.prototype.mockImplementation = function (...args) {
  mockImplementationOrig.call(this, ...args)
  return this
}

MockFunctionContext.prototype.mockRestore = MockFunctionContext.prototype.restore

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

const jest = {
  fn: (...args) => mock.fn(...args),
  spyOn: (obj, name) => {
    assert(Object.hasOwn(obj, name))
    // eslint-disable-next-line @exodus/mutable/no-param-reassign-prop-only
    obj[name] = mock.fn(obj[name])
    return obj[name].mock
  },
  useFakeTimers: () => {
    assertHaveTimers()
    try {
      mock.timers.enable()
    } catch (e) {
      // We allow calling this multiple times and swallow the "MockTimers is already enabled!" error
      if (e.code !== 'ERR_INVALID_STATE') throw e
    }
  },
  runAllTimers: () => {
    assertHaveTimers()
    mock.timers.tick(100_000_000_000) // > 3 years
  },
  runOnlyPendingTimers: () => {
    const noInfiniteLoopBug = major >= 22 || (major === 20 && minor >= 11)
    assert(noInfiniteLoopBug, 'runOnlyPendingTimers requires Node.js >=20.11.0')
    mock.timers.runAll()
  },
  advanceTimersByTime: (time) => {
    assertHaveTimers()
    mock.timers.tick(time)
  },
}

expect.extend({
  toHaveBeenCalled: (fn) => {
    assert.equal(fn?.mock?.constructor, MockFunctionContext)
    return { pass: fn.mock.callCount() > 0 }
  },
  toHaveBeenCalledTimes: (fn, count) => {
    assert.equal(fn?.mock?.constructor, MockFunctionContext)
    return { pass: fn.mock.callCount() === count }
  },
  toHaveBeenCalledWith: (fn, ...expected) => {
    assert.equal(fn?.mock?.constructor, MockFunctionContext)
    for (const call of fn.mock.calls) {
      try {
        expect(call.arguments).toEqual(expected)
        return { pass: true }
      } catch {}
    }

    return { pass: false }
  },
  toHaveBeenLastCalledWith: (fn, ...expected) => {
    assert.equal(fn?.mock?.constructor, MockFunctionContext)
    try {
      expect(fn.mock.calls.at(-1).arguments).toEqual(expected)
      return { pass: true }
    } catch (e) {
      return { pass: false, message: () => e.message }
    }
  },
})

function tap(name, fn) {
  test(name, () =>
    fn({
      ...assert,
      pass: (name) => it(true, name),
      end: () => {},
    })
  )
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
