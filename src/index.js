import { mock, describe, test, it } from 'node:test'
import { expect } from 'expect'
import assert from 'node:assert/strict'

const MockFunctionContext = mock.fn().mock.constructor

Object.defineProperty(MockFunctionContext.prototype, 'callsArguments', {
  get() {
    return this.calls.map((call) => call.arguments)
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
      name = name.replace('%s', args)
    } else {
      for (const [key, value] of Object.entries(args)) {
        name = name.replace(`$${key}`, value) // can collide but we don't care much yet
      }

      if (Array.isArray(args)) {
        for (const arg of args) name = name.replace('%s', arg)
      }
    }

    impl(name, () => (Array.isArray(args) ? fn(...args) : fn(args)))
  }
}

describe.each = makeEach(describe)
test.each = makeEach(test)
it.each = makeEach(it)

const jest = {
  fn: (...args) => mock.fn(...args),
  spyOn: (obj, name) => {
    assert(Object.hasOwn(obj, name))
    // eslint-disable-next-line @exodus/mutable/no-param-reassign-prop-only
    obj[name] = mock.fn(obj[name])
    return obj[name].mock
  },
  useFakeTimers: () => {
    mock.timers.enable()
  },
  runAllTimers: () => {
    mock.timers.tick(100_000_000_000) // > 3 years
  },
  advanceTimersByTime: (time) => {
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
    try {
      assert.deepEqual(fn.mock.calls.at(-1).arguments, expected)
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
