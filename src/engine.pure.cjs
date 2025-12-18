const assert = require('node:assert/strict')
const assertLoose = require('node:assert')
const { matchSnapshot } = require('./engine.pure.snapshot.cjs')

const { setTimeout, setInterval, setImmediate, Date } = globalThis
const { clearTimeout, clearInterval, clearImmediate } = globalThis

const INBAND_PREFIX_REGEX = /^EXODUS_TEST_INBAND:/
const print = console.log.bind(console) // we don not want overrides
Error.stackTraceLimit = 100

let context
let running
let willstart

const abstractProcess = globalThis.process || globalThis.EXODUS_TEST_PROCESS

if (process.env.EXODUS_TEST_IS_BROWSER) {
  globalThis.EXODUS_TEST_PROMISE = new Promise((resolve) => (abstractProcess._exitHook = resolve))
  if (!abstractProcess._maybeProcessExitCode && abstractProcess === globalThis.process) {
    // Electron with Node.js integration has real process
    process._maybeProcessExitCode = () => process._exitHook(process.exitCode ?? 0)
  }
}

// assert module is slower
const check = (condition, message) => {
  if (!condition) throw new Error(message || 'Unexpected')
}

function parseArgs(args) {
  check(args.length <= 3)
  const name = typeof args[0] === 'string' ? args.shift() : 'test'
  const fn = args.pop()
  const options = args.pop() || {}
  return { name, options, fn }
}

class Context {
  test = (...args) => test(...args) // TODO: bind to context
  describe = (...args) => describe(...args) // TODO: bind to context
  plan = (count) => plan(count) // TODO: bind to context
  children = []
  #fullName
  #assert
  #hooks

  constructor(parent, name, options = {}) {
    Object.assign(this, { root: parent?.root, parent, name, options })
    this.#fullName = parent && parent !== parent.root ? `${parent.fullName} > ${name}` : name
    if (this.#fullName === name) this.#fullName = this.#fullName.replace(INBAND_PREFIX_REGEX, '')
    if (this.root) {
      this.parent.children.push(this)
    } else {
      check(this.name === '<root>' && !this.parent)
      this.root = this
    }
  }

  get onlySomewhere() {
    return this.options.only || this.children.some((x) => x.onlySomewhere)
  }

  get only() {
    return (this.options.only && !this.children.some((x) => x.onlySomewhere)) || this.parent?.only
  }

  get fullName() {
    return this.#fullName
  }

  get assert() {
    // Lazy-loading as this is gc-intensive under large trees and unused in expect() itself
    if (!this.#assert) {
      const snap = (o) => matchSnapshot(readSnapshot, assert, this.fullName, serializeSnapshot(o))
      this.#assert = { ...assertLoose, snapshot: snap }
    }

    return this.#assert
  }

  async addHook(type, fn) {
    if (!this.#hooks) this.#hooks = Object.create(null)
    if (!this.#hooks[type]) this.#hooks[type] = []
    this.#hooks[type].push(fn)
  }

  async runHooks(type, context = this) {
    if (!this.#hooks?.[type]) return
    for (const hook of this.#hooks[type]) await runFunction(hook, context)
  }

  diagnostic(message) {
    console.log(`ℹ DIAGNOSTIC ${message}`)
  }
}

function enterContext(name, options) {
  check(!running)
  if (willstart) clearTimeout(willstart) // have to he accurate for engines like Hermes
  context = new Context(context, name, options)
}

function exitContext() {
  check(context !== context.root)
  context = context.parent
  if (context === context.root) willstart = setTimeout(run, 0)
}

async function runFunction(fn, context) {
  if (fn.length < 2) return fn(context)
  return new Promise((resolve, reject) => fn(context, (err) => (err ? reject(err) : resolve())))
}

const runOnly = process.env.EXODUS_TEST_ONLY === '1'

async function runContext(context) {
  const { options, children, fn } = context
  check(!context.running, 'Can not run twice')
  // eslint-disable-next-line @exodus/mutable/no-param-reassign-prop-only
  context.running = true
  check(children.length === 0 || !fn)
  if (options.skip) return print('⏭ SKIP', context.fullName)
  if (context.fn) {
    if (runOnly) {
      if (!context.only) return print('⏭ SKIP', context.fullName)
    } else if (options.only) {
      print(`⚠ WARN test.only requires the --only command-line option`)
    }

    let error
    const stack = [context]
    while (stack[0].parent) stack.unshift(stack[0].parent)

    // TODO: try/catch for hooks?
    for (const c of stack) await c.runHooks('beforeEach', context)
    const guard = { id: null, failed: false }
    const timeout = options.timeout || Number(process.env.EXODUS_TEST_TIMEOUT) || 5000
    guard.promise = new Promise((resolve) => {
      if (['engine262', 'ladybird-js'].includes(process.env.EXODUS_TEST_PLATFORM)) {
        // parallel timeouts are slowing down everything on engine262
        // so we let only the host timeout to catch us, not individual test timeout
        // ladybird-js has no timers but has a maximium promise chain length, so it breaks
        return
      }

      guard.id = setTimeout(() => {
        guard.failed = true
        resolve()
      }, timeout)
    })
    try {
      await Promise.race([guard.promise, runFunction(fn, context)])
      if (guard.failed) throw new Error('timeout reached')
    } catch (e) {
      error = e ?? 'Unknown error'
    }

    clearTimeout(guard.id)
    stack.reverse()
    for (const c of stack) await c.runHooks('afterEach', context)

    const status = error === undefined ? '✔ PASS' : '✖ FAIL'
    print(status, context.fullName, ...(options.todo ? ['# TODO'] : []))
    if (error) {
      delete error.matcherResult
      print(' ', error)
      if (!options.todo) abstractProcess.exitCode = 1
    }
  } else {
    if (options.only && !runOnly) {
      print(`⚠ WARN describe.only requires the --only command-line option`)
    }

    // if (context !== context.root) print(`▶ ${context.fullName}`)
    // TODO: try/catch for hooks?
    // TODO: flatten recursion before running?
    await context.runHooks('before')
    for (const child of children) await runContext(child)
    await context.runHooks('after')
    // if (context !== context.root) print(`▶ ${context.fullName}`)
  }
}

async function run() {
  check(!running)
  running = true
  check(context === context.root)
  await runContext(context).catch((error) => {
    // Should not throw under regular circumstances
    print('‼ FATAL', error)
    abstractProcess.exitCode = 1
  })
  // Let unhandled errors be processed (and set the error code)
  setTimeout(() => abstractProcess._maybeProcessExitCode?.(), 0)
}

async function describe(...args) {
  const { name, options, fn } = parseArgs(args)
  enterContext(name, options)
  // todo: callback support?
  if (!options.skip) {
    try {
      const res = fn(context)
      // we don't need to be async if fn is sync
      if (isPromise(res)) await res
    } catch (error) {
      print('✖ FAIL', context.fullName)
      print('  describe() body threw an error:', error)
      abstractProcess.exitCode = 1
    }
  }

  exitContext()
}

describe.skip = (...args) => {
  const { name, options, fn } = parseArgs(args)
  return describe(name, { ...options, skip: true }, fn)
}

describe.only = (...args) => {
  const { name, options, fn } = parseArgs(args)
  return describe(name, { ...options, only: true }, fn)
}

function plan(count) {
  assert(Number.isSafeInteger(count) && count >= 0)
  console.log('note: context.plan is not yet supported')
}

function test(...args) {
  const { name, options, fn } = parseArgs(args)
  enterContext(name, options)
  context.fn = fn
  exitContext()
}

test.skip = (...args) => {
  const { name, options, fn } = parseArgs(args)
  return test(name, { ...options, skip: true }, fn)
}

test.only = (...args) => {
  const { name, options, fn } = parseArgs(args)
  return test(name, { ...options, only: true }, fn)
}

test.todo = (...args) => {
  const { name, options, fn } = parseArgs(args)
  return test(name, { ...options, todo: true }, fn)
}

class MockTimers {
  #enabled = false
  #base = 0
  #elapsed = 0
  #queue = []
  enable({ now = 0, apis = ['setInterval', 'setTimeout', 'setImmediate', 'Date'] } = {}) {
    check(!this.#enabled, 'MockTimers is already enabled!')
    this.#base = +now
    this.#elapsed = 0
    if (apis.includes('setInterval')) {
      globalThis.setInterval = this.#setInterval.bind(this)
      globalThis.clearInterval = this.#clearInterval.bind(this)
    }

    if (apis.includes('setTimeout')) {
      globalThis.setTimeout = this.#setTimeout.bind(this)
      globalThis.clearTimeout = this.#clearTimeout.bind(this)
    }

    if (apis.includes('setImmediate')) {
      if (process.env.EXODUS_TEST_PLATFORM === 'hermes') {
        // Sigh, these are used internally
        const isInternal = (x) =>
          x.includes('at handleResolved ') || x.includes('/InternalBytecode/InternalBytecode')
        globalThis.setImmediate = (...args) => {
          const { stack } = new Error() // eslint-disable-line unicorn/error-message
          if (isInternal(stack.split('\n')[2])) return setImmediate(...args)
          return this.#setImmediate(...args)
        }
      } else {
        globalThis.setImmediate = this.#setImmediate.bind(this)
      }

      globalThis.clearImmediate = this.#clearImmediate.bind(this)
    }

    const OrigDate = Date
    if (apis.includes('Date')) {
      const now = () => this.#base + this.#elapsed
      globalThis.Date = class Date extends OrigDate {
        static now = () => now()
        constructor(first = globalThis.Date.now(), ...rest) {
          super(first, ...rest)
        }
      }
    }
  }

  reset() {
    this.#enabled = false
    Object.assign(globalThis, { setTimeout, setInterval, setImmediate, Date })
    Object.assign(globalThis, { clearTimeout, clearInterval, clearImmediate })
  }

  [Symbol.dispose]() {
    this.reset()
  }

  tick(milliseconds = 1) {
    this.#elapsed += milliseconds
    while (this.#microtick() !== null);
  }

  async tickAsync(milliseconds = 1) {
    const finish = this.#elapsed + milliseconds
    await awaitForMicrotaskQueue()
    while (this.#queue[0] && this.#queue[0].runAt <= finish) {
      this.#elapsed = Math.max(this.#elapsed, this.#queue[0].runAt)
      while (this.#microtick() !== null) await awaitForMicrotaskQueue()
    }

    this.#elapsed = finish
  }

  #microtick() {
    if (this.#queue.length === 0 || !(this.#queue[0].runAt <= this.#elapsed)) return null
    const next = this.#queue.shift()
    if (next.interval !== undefined) {
      next.runAt += next.interval
      this.#schedule(next)
    }

    next.callback(...next.args)
  }

  #schedule(entry) {
    const before = this.#queue.findIndex((x) => x.runAt > entry.runAt)
    if (before === -1) {
      this.#queue.push(entry)
    } else {
      this.#queue.splice(before, 0, entry)
    }

    return entry
  }

  runAll() {
    this.tick(Math.max(0, ...this.#queue.map((x) => x.runAt - this.#elapsed)))
  }

  setTime(milliseconds) {
    this.#base = milliseconds
  }

  #setTimeout(callback, delay = 0, ...args) {
    return this.#schedule({ callback, runAt: delay + this.#elapsed, args })
  }

  #setInterval(callback, delay = 0, ...args) {
    return this.#schedule({ callback, runAt: delay + this.#elapsed, interval: delay, args })
  }

  #setImmediate(callback, ...args) {
    return this.#schedule({ callback, runAt: -1, args })
  }

  #clearTimeout(id) {
    this.#queue = this.#queue.filter((x) => x !== id)
  }

  #clearInterval(id) {
    this.#clearTimeout(id)
  }

  #clearImmediate(id) {
    this.#clearTimeout(id)
  }
}

const mock = {
  module: undefined,
  timers: new MockTimers(),
  fn: (original = () => {}, implementation = original) => {
    let impl = implementation
    const _mock = {
      calls: [],
      callCount() {
        return this.calls.length
      },
      mockImplementation: (fn) => {
        impl = fn
      },
      mockImplementationOnce: (fn) => {
        const prev = impl
        impl = (...args) => {
          impl = prev
          return fn.apply(this, args)
        }
      },
      resetCalls: () => {
        _mock.calls.length = 0
      },
      restore: () => {
        impl = original
      },
    }

    return new Proxy(function () {}, {
      __proto__: null,
      apply(fn, _this, args) {
        // eslint-disable-next-line unicorn/error-message
        const call = { arguments: args, stack: new Error(), target: undefined, this: _this } // todo: recheck .stack location

        try {
          call.result = impl.apply(_this, args)
          call.error = undefined
        } catch (err) {
          call.result = undefined
          call.error = err
          throw err
        } finally {
          _mock.calls.push(call)
        }

        return call.result
      },
      construct(target, args) {
        // eslint-disable-next-line unicorn/error-message
        const call = { arguments: args, stack: new Error(), target } // todo: recheck .stack location

        try {
          call.result = call.this = new impl(...args) // eslint-disable-line new-cap
          call.error = undefined
        } catch (err) {
          call.result = undefined
          call.error = err
          throw err
        } finally {
          _mock.calls.push(call)
        }

        return call.result
      },
      get: (fn, key) => {
        if (key === 'mock') return _mock
        const target = key !== 'prototype' && key in fn ? fn : impl
        return target[key]
      },
      set: (fn, key, value) => {
        const target = key !== 'prototype' && key in fn ? fn : impl
        target[key] = value
        return true
      },
      getOwnPropertyDescriptor(fn, key) {
        const target = key !== 'prototype' && key in fn ? fn : impl
        return Object.getOwnPropertyDescriptor(target, key)
      },
    })
  },
}

if (
  process.env.EXODUS_TEST_ENGINE === 'node:pure' ||
  process.env.EXODUS_TEST_ENGINE === 'electron-as-node:pure'
) {
  // Try load module mocks from node:test, if present
  try {
    const nodeTest = require('node:test')
    mock.module = nodeTest.mock.module.bind(nodeTest.mock)
  } catch {}
}

const beforeEach = (fn) => context.addHook('beforeEach', fn)
const afterEach = (fn) => context.addHook('afterEach', fn)
const before = (fn) => context.addHook('before', fn)
const after = (fn) => context.addHook('after', fn)

const isPromise = (x) => Boolean(x && x.then && x.catch && x.finally)
const nodeVersion = '9999.99.99'

function getMacrotick() {
  const { scheduler, MessageChannel } = globalThis
  if (scheduler?.yield) return () => scheduler.yield()
  if (setImmediate) return () => new Promise((resolve) => setImmediate(resolve))
  if (MessageChannel) {
    return async () => {
      const { port1, port2 } = new MessageChannel()
      await new Promise((resolve) => {
        // eslint-disable-next-line unicorn/prefer-add-event-listener
        port1.onmessage = resolve // also starts
        port2.postMessage(0)
      })
      port2.close()
    }
  }

  return null // no fallback
}

const macrotick = getMacrotick()

const awaitForMicrotaskQueue = async () => {
  // Scheduling an event at the end of current microtasks queue
  if (globalThis?.process?.nextTick) {
    if (globalThis.Bun) await Promise.resolve() // No idea what's up with Bun microtasks
    // We are in microtasks, scheduling a low-priority one will allow everything else to pass
    // Except recursive process.nextTick calls, but that's acceptable
    return new Promise((resolve) => globalThis.process.nextTick(resolve))
  }

  // If that is not available, we can wait for the actual next cycle
  // For Hermes, we use -Xmicrotask-queue for setImmediate to act not like just a Promise.resolve().then(
  // TODO: recheck if setImmediate is not faked with setTimeout if we enable a polyfill for it for JSC?
  // Browsers have scheduler.yield and/or MessageChannel which also perform macroticks
  if (macrotick) return macrotick()

  // If the above is not available, just create a chain of (high-priority) microtasks,
  // hoping that'll allow other high-priority ones to pass
  // Barebones like JSC and SpiderMonkey hit this currently
  //
  // Do not rely on setTimeout here! it will tick actual time and is terribly slow (i.e. timers no longer fake)
  // 50_000 should be enough to flush everything that's going on in the microtask queue
  // engine262 is extremely slow, tick just above 100 on it
  const promise = Promise.resolve()
  const tickPromiseRounds = process.env.EXODUS_TEST_PLATFORM === 'engine262' ? 110 : 50_000
  for (let i = 0; i < tickPromiseRounds; i++) await promise
}

let builtinModules = []
let requireIsRelative = false
let relativeRequire, baseFile, isTopLevelESM, syncBuiltinESMExports, readSnapshot, utilFormat
if (process.env.EXODUS_TEST_ENVIRONMENT === 'bundle') {
  // eslint-disable-next-line no-undef
  const files = EXODUS_TEST_FILES
  baseFile = files.length === 1 ? files[0] : undefined
  isTopLevelESM = () => false
  // eslint-disable-next-line no-undef
  const bundleSnaps = typeof EXODUS_TEST_SNAPSHOTS !== 'undefined' && new Map(EXODUS_TEST_SNAPSHOTS)
  const resolveSnapshot = (f) => snapshotResolver(f[0], f[1]).join('/')
  readSnapshot = (f = baseFile) => (f && bundleSnaps?.get(resolveSnapshot(f))) || null
  utilFormat = require('exodus-test:util-format')
} else {
  const { existsSync, readFileSync } = require('node:fs')
  const { dirname, basename, normalize, join } = require('node:path')
  const nodeModule = require('node:module')
  const files = process.argv.slice(1)
  baseFile = files.length === 1 && existsSync(files[0]) ? normalize(files[0]) : undefined
  requireIsRelative = Boolean(baseFile)
  relativeRequire = baseFile ? nodeModule.createRequire(baseFile) : require
  isTopLevelESM = () =>
    !baseFile || // assume ESM otherwise
    !Object.hasOwn(relativeRequire.cache, baseFile) || // node esm
    relativeRequire.cache[baseFile].exports[Symbol.toStringTag] === 'Module' // bun esm
  const resolveSnapshot = (f) => join(...snapshotResolver(dirname(f), basename(f)))
  readSnapshot = (f = baseFile) => (f ? readFileSync(resolveSnapshot(f), 'utf8') : null)
  builtinModules = nodeModule.builtinModules
  syncBuiltinESMExports = nodeModule.syncBuiltinESMExports || nodeModule.syncBuiltinExports // bun has it under a different name (also a no-op and always synced atm)
  utilFormat = require('node:util').format
}

// eslint-disable-next-line no-undef
let snapshotResolver = (dir, name) => [dir, `${name}.snapshot`] // default per Node.js docs
let snapshotSerializers = [(obj) => JSON.stringify(obj, null, 2)]
const serializeSnapshot = (obj) => {
  let val = obj
  for (const fn of snapshotSerializers) val = fn(val)
  return val
}

const setSnapshotSerializers = ([...arr]) => {
  snapshotSerializers = arr
}

const setSnapshotResolver = (fn) => {
  snapshotResolver = fn
}

enterContext('<root>')

/* eslint-disable unicorn/no-useless-spread */
module.exports = {
  engine: 'pure',
  ...{ assert, assertLoose },
  ...{ mock, describe, test, beforeEach, afterEach, before, after },
  ...{ builtinModules, syncBuiltinESMExports },
  ...{ utilFormat, isPromise, nodeVersion, awaitForMicrotaskQueue },
  ...{ requireIsRelative, relativeRequire, baseFile, isTopLevelESM, mockModule: mock.module },
  ...{ readSnapshot, setSnapshotSerializers, setSnapshotResolver },
}
/* eslint-enable unicorn/no-useless-spread */
