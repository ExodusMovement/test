import assert from 'node:assert/strict'
import { describe as nodeDescribe, test as nodeTest, afterEach, after } from 'node:test'
import { format, types } from 'node:util'
import { jestConfig } from './jest.config.js'
import { jestFunctionMocks } from './jest.fn.js'
import { jestModuleMocks } from './jest.mock.js'
import * as jestTimers from './jest.timers.js'
import './jest.snapshot.js'
import { createCallerLocationHook } from './dark.cjs'
import './version.js'
import { expect } from 'expect'
import matchers from 'jest-extended'
import { format as prettyFormat } from 'pretty-format'

const { getCallerLocation, installLocationInNextTest } = createCallerLocationHook()

expect.extend(matchers)

let defaultTimeout = jestConfig().testTimeout // overridable via jest.setTimeout()
const defaultConcurrency = jestConfig().maxConcurrency

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
    // better than nothing
    const printed = (x) =>
      x && [null, Array.prototype, Object.prototype].includes(Object.getPrototypeOf(x))
        ? prettyFormat(x, { min: true })
        : `${x}`

    const args = parseArgs(list, rest)
    const wrapped = args.every((x) => Array.isArray(x))
    const objects = args.every((x) => x && typeof x === 'object') // arrays also are true
    let i = 0
    for (const arg of args) {
      let name = template.replaceAll('$#', i++)

      const args = wrapped ? arg : [arg]

      if (objects) {
        if (arg && typeof arg === 'object' && Object.keys(arg).length > 0) {
          // Only for the non-wrapped version
          for (const [key, value] of Object.entries(arg)) {
            name = name.replace(`$${key}`, printed(formatArg(value)))
          }
        } else {
          name = name.replaceAll(/\$\w+/gu, printed(formatArg(arg)))
        }
      }

      if (Array.isArray(args)) {
        const length = [...name.replaceAll('%%', '').matchAll(/%[psdifjo]/gu)].length
        if (length > 0) name = format(name, ...args.slice(0, length).map(formatArg))
      }

      impl(name, () => (Array.isArray(args) ? fn(...args) : fn(args)))
    }
  }

const forceExit = process.execArgv.map((x) => x.replaceAll('_', '-')).includes('--test-force-exit')

const inConcurrent = []
const inDescribe = []
const concurrent = []
const describe = (...args) => {
  const fn = args.pop()
  inDescribe.push(fn)
  const optionsConcurrent = args?.at(-1)?.concurrency > 1
  if (optionsConcurrent) inConcurrent.push(fn)
  const result = nodeDescribe(...args, async () => {
    const res = fn()

    // We do only block-level concurrency, not file-level
    if (concurrent.length === 1) {
      testRaw(...concurrent[0])
      concurrent.length = 0
    } else if (concurrent.length > 0) {
      const queue = [...concurrent]
      concurrent.length = 0
      describe('concurrent', { concurrency: defaultConcurrency }, () => {
        for (const args of queue) testRaw(...args)
      })
    }

    return res
  })
  if (optionsConcurrent) inConcurrent.pop()
  inDescribe.pop()
  return result
}

const testRaw = (callerLocation, testBase, name, fn, testTimeout) => {
  const timeout = testTimeout ?? defaultTimeout
  installLocationInNextTest(callerLocation)
  if (fn.length > 0) return testBase(name, { timeout }, (t, c) => fn(c))
  if (!forceExit) return testBase(name, { timeout }, fn)
  return testBase(name, { timeout }, async (t) => {
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

const test = (...args) => testRaw(getCallerLocation(), nodeTest, ...args)
test.only = (...args) => testRaw(getCallerLocation(), nodeTest.only, ...args)

describe.each = makeEach(describe)
test.each = makeEach(test) // TODO: pass caller location
test.concurrent = (...args) => {
  assert(inDescribe.length > 0, 'test.concurrent is supported only within a describe block')
  if (inConcurrent.length > 0) return test(...args)
  concurrent.push([getCallerLocation(), nodeTest, ...args])
}

test.concurrent.each = makeEach(test.concurrent)
describe.skip = (...args) => nodeDescribe.skip(...args)
test.skip = (...args) => nodeTest.skip(...args)

afterEach(() => {
  for (const { error } of expect.extractExpectedAssertionsErrors()) throw error
})

after(() => {
  const timeout = defaultTimeout // give everything additional (configurable) defaultTimeout time to finish, otherwide fail
  jestTimers.useRealTimers()
  const timer = setTimeout(() => {
    console.error(
      `Tests completed, but still have asynchronous activity after additional ${timeout}ms.\nTerminating with a failure...`
    )
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(1)
  }, timeout)
  timer.unref()
})

const jest = {
  exodus: Object.create(null), // declare ourselves
  setTimeout: (x) => {
    assert.equal(typeof x, 'number')
    defaultTimeout = x
    return this
  },
  ...jestFunctionMocks,
  ...jestModuleMocks,
  ...jestTimers,
}

export { jest, describe, test, test as it }
export { expect } from 'expect'
export { beforeEach, afterEach, before as beforeAll, after as afterAll } from 'node:test'
