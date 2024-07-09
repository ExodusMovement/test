import assert from 'node:assert/strict'
import { describe, test, it, afterEach } from 'node:test'
import { format } from 'node:util'
import { jestfn, allMocks } from './jest.fn.js'
import { jestmock, requireActual, requireMock } from './jest.mock.js'
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

describe.each = makeEach(describe)
test.each = makeEach(test)
it.each = makeEach(it)

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
  ...jestTimers,
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
