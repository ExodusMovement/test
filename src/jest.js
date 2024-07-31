import { assert, utilFormat, isPromise, mock } from './engine.js'
import * as node from './engine.js'
import { jestConfig } from './jest.config.js'
import { jestFunctionMocks } from './jest.fn.js'
import { jestModuleMocks } from './jest.mock.js'
import * as jestTimers from './jest.timers.js'
import './jest.snapshot.js'
import { createCallerLocationHook, insideEsbuild } from './dark.cjs'
import { haveValidTimers } from './version.js'
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
        if (length > 0) name = utilFormat(name, ...args.slice(0, length).map(formatArg))
      }

      impl(name, () => (Array.isArray(args) ? fn(...args) : fn(args)))
    }
  }

const execArgv = process.env.EXODUS_TEST_EXECARGV
  ? JSON.parse(process.env.EXODUS_TEST_EXECARGV)
  : process.execArgv
const forceExit = execArgv.map((x) => x.replaceAll('_', '-')).includes('--test-force-exit')

const inConcurrent = []
const inDescribe = []
const concurrent = []

const makeDecribe =
  (nodeDescribe) =>
  (...args) => {
    const fn = args.pop()
    inDescribe.push(fn)
    const optionsConcurrent = args?.at(-1)?.concurrency > 1
    if (optionsConcurrent) inConcurrent.push(fn)
    const result = nodeDescribe(...args, () => {
      const res = fn()

      // We do only block-level concurrency, not file-level
      if (concurrent.length === 1) {
        testRaw(...concurrent[0])
        concurrent.length = 0
      } else if (concurrent.length > 0) {
        const queue = [...concurrent]
        concurrent.length = 0
        nodeDescribe('concurrent', { concurrency: defaultConcurrency }, () => {
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
      isPromise(res),
      `Test "${t.fullName}" did not return a Promise or supply a callback, which is required in force-exit mode.
For tests to not end abruptly, use either async functions (recommended), Promises, or specify callbacks to test() / it().
Also, using expect.assertions() to ensure the planned number of assertions is being called is advised for async code.`
    )
    return res
  })
}

const describe = makeDecribe(node.describe)
describe.only = makeDecribe(node.describe.only)

const test = (...args) => testRaw(getCallerLocation(), node.test, ...args)
test.only = (...args) => testRaw(getCallerLocation(), node.test.only, ...args)

describe.each = makeEach(describe)
test.each = makeEach(test) // TODO: pass caller location
test.concurrent = (...args) => {
  assert(inDescribe.length > 0, 'test.concurrent is supported only within a describe block')
  if (inConcurrent.length > 0) return test(...args)
  concurrent.push([getCallerLocation(), node.test, ...args])
}

test.concurrent.each = makeEach(test.concurrent)
describe.skip = (...args) => node.describe.skip(...args)
test.skip = (...args) => node.test.skip(...args)

node.afterEach(() => {
  for (const { error } of expect.extractExpectedAssertionsErrors()) throw error
})

if (globalThis.process) {
  node.after(() => {
    jestTimers.useRealTimers()
    const prefix = `Tests completed, but still have asynchronous activity after`

    // give everything additional (configurable) defaultTimeout time to finish, otherwide fail
    const timeout = defaultTimeout
    setTimeout(() => {
      console.error(`${prefix} additional ${timeout}ms. Terminating with a failure...`)
      process.exit(1)
    }, timeout).unref()

    // Warn after 5s that something is going on
    const warnTimeout = 5000
    if (warnTimeout < timeout + 1000) {
      setTimeout(() => {
        console.warn(`${prefix} ${warnTimeout}ms. Waiting for ${timeout}ms to pass to finish...`)
      }, warnTimeout).unref()
    }
  })
}

const isBundle = process.env.EXODUS_TEST_ENVIRONMENT === 'bundle' // TODO: improve mocking from bundle
export const jest = {
  exodus: {
    __proto__: null,
    platform: String(process.env.EXODUS_TEST_PLATFORM), // e.g. 'hermes', 'node'
    engine: String(process.env.EXODUS_TEST_ENGINE), // e.g. 'hermes:bundle', 'node:bundle', 'node:test', 'node:pure'
    implementation: String(node.engine), // aka process.env.EXODUS_TEST_CONTEXT, e.g. 'node:test' or 'pure'
    features: {
      __proto__: null,
      timers: Boolean(mock.timers && haveValidTimers),
      esmMocks: Boolean(mock.module && !isBundle), // full support for ESM mocks
      esmInterop: Boolean(insideEsbuild && !isBundle), // loading/using ESM as CJS, ESM mocks creation without a mocker function
      esmNamedBuiltinMocks: Boolean(mock.module || (insideEsbuild && !isBundle)), // support for named ESM imports from builtin module mocks
      concurrency: node.engine !== 'pure', // pure engine doesn't support concurrency
    },
  },
  setTimeout: (x) => {
    assert.equal(typeof x, 'number')
    defaultTimeout = x
    return this
  },
  ...jestFunctionMocks,
  ...jestModuleMocks,
  ...jestTimers,
}

const wrapCallback = (fn) => (fn.length > 0 ? (t, c) => fn(c) : () => fn())

export const beforeEach = (fn) => node.beforeEach(wrapCallback(fn))
export const afterEach = (fn) => node.afterEach(wrapCallback(fn))
export const beforeAll = (fn) => node.before(wrapCallback(fn))
export const afterAll = (fn) => node.after(wrapCallback(fn))

export { describe, test, test as it }
export { expect } from 'expect'
