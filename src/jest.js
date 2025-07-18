import { assert, utilFormat, isPromise } from './engine.js'
import * as node from './engine.js'
import { jestConfig } from './jest.config.js'
import { jestFunctionMocks } from './jest.fn.js'
import { jestModuleMocks } from './jest.mock.js'
import * as jestTimers from './jest.timers.js'
import { setupSnapshots } from './jest.snapshot.js'
import { createCallerLocationHook } from './dark.cjs'
import { exodus } from './exodus.js'
import { expect } from './expect.cjs'
import { format as prettyFormat } from './pretty-format.cjs'
import { timersTrack, timersDebug } from './timers-track.js'

const { getCallerLocation, installLocationInNextTest } = createCallerLocationHook()
const { setTimeout } = globalThis

if (process.env.EXODUS_TEST_TIMERS_TRACK) timersTrack()

let inband = false
if (process.env.EXODUS_TEST_ENVIRONMENT !== 'bundle') {
  const files = process.argv.slice(1)
  inband = files.length === 1 && ['/inband.js', '\\inband.js'].some((s) => files[0].endsWith(s))
}

// We can't provide snapshots in inband tests yet, and mocks/timers are unsafe there
const addStatefulApis = !inband
if (addStatefulApis) setupSnapshots(expect)

let defaultTimeout = Number(process.env.EXODUS_TEST_TIMEOUT) || jestConfig().testTimeout // overridable via jest.setTimeout()
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

// Hack for common testing with simple arrow functions
const formatArg = (x) => {
  if (x && x instanceof Function) {
    if (`${x}` === '()=>{}') return '() => {}' // likely minified by esbuild
    if (globalThis.Bun && `${x}`.replace(/\s/g, '') === '()=>{}') return '() => {}' // Bun breaks formatting
  }

  return x
}

const eachCallerLocation = []
const makeEach =
  (impl) =>
  (list, ...rest) =>
  (template, fn, ...restArgs) => {
    eachCallerLocation.unshift(getCallerLocation())
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

      impl(name, () => (Array.isArray(args) ? fn(...args) : fn(args)), ...restArgs)
    }

    eachCallerLocation.shift()
  }

const execArgv = process.env.EXODUS_TEST_EXECARGV
  ? JSON.parse(process.env.EXODUS_TEST_EXECARGV)
  : process.execArgv
const forceExit = execArgv.map((x) => x.replaceAll('_', '-')).includes('--test-force-exit')

const inConcurrent = []
const inDescribe = []
const concurrent = []

const describeRaw = (callerLocation, nodeDescribe, ...args) => {
  const fn = args.pop()
  inDescribe.push(fn)
  const optionsConcurrent = args?.at(-1)?.concurrency > 1
  if (optionsConcurrent) inConcurrent.push(fn)
  installLocationInNextTest(eachCallerLocation[0] || callerLocation)
  const result = nodeDescribe(...args, () => {
    const res = fn()

    // We do only block-level concurrency, not file-level
    if (concurrent.length === 1) {
      testRaw(...concurrent[0])
      concurrent.length = 0
    } else if (concurrent.length > 0) {
      const queue = [...concurrent]
      concurrent.length = 0
      installLocationInNextTest(eachCallerLocation[0] || callerLocation)
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
  installLocationInNextTest(eachCallerLocation[0] || callerLocation)
  if (fn?.length > 0) return testBase(name, { timeout }, (t, c) => fn(c))
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

function makeDescribe(impl) {
  return (...args) => describeRaw(getCallerLocation(), impl, ...args)
}

function makeTest(impl) {
  return (...args) => testRaw(getCallerLocation(), impl, ...args)
}

function makeTestConcurent(impl) {
  return (...args) => {
    assert(inDescribe.length > 0, 'test.concurrent is supported only within a describe block')
    if (inConcurrent.length > 0) return testRaw(getCallerLocation(), impl, ...args)
    concurrent.push([eachCallerLocation[0] || getCallerLocation(), impl, ...args])
  }
}

const describe = makeDescribe(node.describe)
describe.only = makeDescribe(node.describe.only)
describe.skip = makeDescribe(node.describe.skip)

const test = makeTest(node.test)
test.only = makeTest(node.test.only)
test.skip = makeTest(node.test.skip)
test.todo = makeTest(node.test.todo)

test.concurrent = makeTestConcurent(node.test)
test.concurrent.only = makeTestConcurent(node.test.only)
test.concurrent.skip = makeTestConcurent(node.test.skip)

describe.each = makeEach(describe)
describe.only.each = makeEach(describe.only)
describe.skip.each = makeEach(describe.skip)
test.each = makeEach(test)
test.concurrent.each = makeEach(test.concurrent)
test.concurrent.only.each = makeEach(test.concurrent.only)
test.concurrent.skip.each = makeEach(test.concurrent.skip)
test.only.each = makeEach(test.only)
test.skip.each = makeEach(test.skip)

node.afterEach(() => {
  for (const { error } of expect.extractExpectedAssertionsErrors()) throw error
})

if (process.env.EXODUS_TEST_PLATFORM !== 'deno' && globalThis.process) {
  // TODO: deno, other engines

  const reportActivity = () => {
    if (process.env.EXODUS_TEST_TIMERS_TRACK) timersDebug()
    if (process?.getActiveResourcesInfo) {
      const all = process.getActiveResourcesInfo().filter((r) => r !== 'PipeWrap')
      if (all.length > 0) {
        const entries = [...new Set(all)].map((k) => [k, all.filter((x) => x === k).length])
        const pretty = prettyFormat(Object.fromEntries(entries), { min: true })
        console.log(`Active resources: { ${pretty.slice(1, -1).replaceAll('"', '')} }`)
      }
    }
  }

  // This doesn't work with async imported tests, so for inband, we delay
  const after = () => {
    jestTimers.useRealTimers()
    const prefix = `Tests completed, but still have asynchronous activity after`

    // give everything additional (configurable) defaultTimeout time to finish, otherwide fail
    const timeout = defaultTimeout
    setTimeout(() => {
      reportActivity()
      console.error(`${prefix} additional ${timeout}ms. Terminating with a failure...`)
      process.exit(1)
    }, timeout).unref?.()

    // Warn after 5s that something is going on
    const warnTimeout = 5000
    if (warnTimeout < timeout + 1000) {
      setTimeout(() => {
        reportActivity()
        console.warn(`${prefix} ${warnTimeout}ms. Waiting for ${timeout}ms to pass to finish...`)
      }, warnTimeout).unref?.()
    }
  }

  if (inband) {
    globalThis.EXODUS_TEST_AFTER_INBAND = after
  } else {
    node.after(after)
  }
}

export const jest = {
  exodus: {
    __proto__: null,
    ...exodus,
    mock: {
      ...exodus.mock,
      fetchNoop: () => {
        // We can't use pure noop, it will break chained fetch().then(), so let's reject
        const fetch = () => Promise.reject(new Error('fetch is disabled by mock.fetchNoop()'))
        globalThis.fetch = jest.fn(fetch)
        return globalThis.fetch
      },
      websocketNoop: () => {
        globalThis.WebSocket = jest.fn()
        return globalThis.WebSocket
      },
    },
  },
  setTimeout: (x) => {
    assert.equal(typeof x, 'number')
    defaultTimeout = x
    return this
  },
  ...jestFunctionMocks,
  ...(addStatefulApis ? jestModuleMocks : {}),
  ...(addStatefulApis ? jestTimers : {}),
}

const wrapCallback = (fn) => (fn.length > 0 ? (t, c) => fn(c) : () => fn())

export const beforeEach = (fn) => node.beforeEach(wrapCallback(fn))
export const afterEach = (fn) => node.afterEach(wrapCallback(fn))
export const beforeAll = (fn) => node.before(wrapCallback(fn))
export const afterAll = (fn) => node.after(wrapCallback(fn))

export const should = (...args) => test(...args)
should.runWhen = should.run = () => {} // micro-should compat

export { describe, test, test as it }
export { expect } from './expect.cjs'
