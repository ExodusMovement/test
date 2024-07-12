import assert from 'node:assert/strict'
import { describe as nodeDescribe, test as nodeTest, afterEach } from 'node:test'
import { format, types } from 'node:util'
import { jestfn, allMocks } from './jest.fn.js'
import { jestmock, requireActual, requireMock, resetModules } from './jest.mock.js'
import * as jestTimers from './jest.timers.js'
import './jest.snapshot.js'
import { getCallerLocation, installLocationInNextTest } from './dark.cjs'
import { expect } from 'expect'
import matchers from 'jest-extended'

expect.extend(matchers)

let defaultTimeout = 5000

function parseArgs(list, targs) {
  if (!(Object.isFrozen(list) && list.length === targs.length + 1)) return list // template check
  const [header, ...separators] = list.map((x) => x.trim())
  const titles = header.split('|').map((x) => x.trim())
  assert(titles.length > 0 && titles.every((x) => x.length > 0), 'Malformed .each table header')
  assert(targs.length === separators.length)
  assert(targs.length % titles.length === 0, 'Malformed .each table')
  // a '|' b '|' c '\n' d '|' e '|' f, and \n is '' after trim
  assert(
    separators.every((s, i) => s === ((i + 1) % titles.length === 0 ? '' : '|')),
    'Malformed .each table body'
  )
  const result = []
  while (targs.length >= titles.length) {
    const part = targs.splice(0, titles.length)
    result.push(Object.fromEntries(titles.map((key, i) => [key, part[i]])))
  }

  assert.equal(targs.length, 0)
  return result
}

const makeEach =
  (impl) =>
  (list, ...rest) =>
  (template, fn) => {
    // Hack for common testing with simple arrow functions, until we can disable esbuild minification
    const formatArg = (x) => (x && x instanceof Function && `${x}` === '()=>{}' ? '() => {}' : x)

    for (const arg of parseArgs(list, rest)) {
      let name = template

      const args = !arg || typeof arg !== 'object' ? [arg] : arg

      for (const [key, value] of Object.entries(args)) {
        name = name.replace(`$${key}`, formatArg(value)) // can collide but we don't care much yet
      }

      if (Array.isArray(args)) {
        const length = [...name.replaceAll('%%', '').matchAll(/%./gu)].length
        if (length > 0) name = format(name, ...args.slice(0, length).map(formatArg))
      }

      impl(name, () => (Array.isArray(args) ? fn(...args) : fn(args)))
    }
  }

const forceExit = process.execArgv.map((x) => x.replaceAll('_', '-')).includes('--test-force-exit')

const describe = (...args) => nodeDescribe(...args)
const test = (name, fn, testTimeout) => {
  const timeout = testTimeout ?? defaultTimeout
  installLocationInNextTest(getCallerLocation())
  if (fn.length > 0) return nodeTest(name, (t, c) => fn(c))
  if (!forceExit) return nodeTest(name, fn)
  return nodeTest(name, { timeout }, async (t) => {
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
  spyOn: (obj, name, accessType) => {
    assert(!accessType, `accessType "${accessType}" is not supported`)
    assert(obj && name && name in obj && !(name in {}) && !(name in Object.prototype))
    const fn = jestfn(obj[name], obj, name)
    // eslint-disable-next-line @exodus/mutable/no-param-reassign-prop-only
    obj[name] = fn
    return fn
  },
  setTimeout: (x) => {
    assert.equal(typeof x, 'number')
    defaultTimeout = x
    return this
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
