import assert from 'node:assert/strict'
import { describe as nodeDescribe, test as nodeTest, afterEach } from 'node:test'
import { format, types } from 'node:util'
import { jestfn, allMocks } from './jest.fn.js'
import { jestmock, requireActual, requireMock, resetModules } from './jest.mock.js'
import * as jestTimers from './jest.timers.js'
import './jest.snapshot.js'
import { expect } from 'expect'

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

const forceExit = process.execArgv.map((x) => x.replaceAll('_', '-')).includes('--test-force-exit')

const describe = (...args) => nodeDescribe(...args)
const test = (name, fn) => {
  if (fn.length > 0) return nodeTest(name, (t, c) => fn(c))
  if (!forceExit) return nodeTest(name, fn)
  return nodeTest(name, async (t) => {
    const res = fn()
    assert(
      types.isPromise(res),
      `Test "${t.fullName}" did not return a Promise or supply a callback, which is required in force-exit mode.
For tests to not end abruptly, use either async functions (recommended), Promises, or specify callbacks to test() / it().
Also, using expect.assertions() to ensure the planned number of assertions is being called is advised for async code.`
    )
    return res
  })
}

describe.each = makeEach(describe)
test.each = makeEach(test)
describe.skip = (...args) => nodeDescribe.skip(...args)
test.skip = (...args) => nodeTest.skip(...args)

afterEach(() => {
  for (const { error } of expect.extractExpectedAssertionsErrors()) throw error
})

const jest = {
  fn: (impl) => jestfn(impl), // hide extra arguments
  ...allMocks,
  spyOn: (obj, name) => {
    assert(obj && name && name in obj && !(name in {}) && !(name in Object.prototype))
    const fn = jestfn(obj[name], obj, name)
    // eslint-disable-next-line @exodus/mutable/no-param-reassign-prop-only
    obj[name] = fn
    return fn
  },
  mock: jestmock,
  requireMock,
  requireActual,
  resetModules,
  ...jestTimers,
}

export { jest, describe, test, test as it }
export { expect } from 'expect'
export { beforeEach, afterEach, before as beforeAll, after as afterAll } from 'node:test'
