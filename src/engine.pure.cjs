const assert = require('node:assert/strict')
const assertLoose = require('node:assert')

const { setTimeout, setInterval, setImmediate, Date } = globalThis
const { clearTimeout, clearInterval, clearImmediate } = globalThis

const print = console.log.bind(console) // we don not want overrides
Error.stackTraceLimit = 100

let context
let running
let willstart

const abstractProcess = globalThis.process || globalThis.EXODUS_TEST_PROCESS

function parseArgs(args) {
  assert(args.length <= 3)
  const name = typeof args[0] === 'string' ? args.shift() : 'test'
  const fn = args.pop()
  const options = args.pop() || {}
  return { name, options, fn }
}

class Context {
  test = test // todo: bind to context
  describe = describe // todo: bind to context
  children = []
  assert = { ...assertLoose, snapshot: undefined }
  hooks = { __proto__: null, before: [], after: [], beforeEach: [], afterEach: [] }

  constructor(parent, name, options = {}) {
    Object.assign(this, { root: parent?.root, parent, name, options })
    this.fullName = parent && parent !== parent.root ? `${parent.fullName} > ${name}` : name
    if (this.root) {
      this.parent.children.push(this)
    } else {
      assert(this.name === '<root>' && !this.parent)
      this.root = this
    }
  }

  get onlySomewhere() {
    return this.options.only || this.children.some((x) => x.onlySomewhere)
  }

  get only() {
    return (this.options.only && !this.children.some((x) => x.onlySomewhere)) || this.parent?.only
  }
}

function enterContext(name, options) {
  assert(!running)
  if (willstart) clearTimeout(willstart) // have to he accurate for engines like Hermes
  context = new Context(context, name, options)
}

function exitContext() {
  assert(context !== context.root)
  context = context.parent
  if (context === context.root) willstart = setTimeout(run, 0)
}

async function runFunction(fn, context) {
  if (fn.length < 2) return fn(context)
  return new Promise((resolve, reject) => fn(context, (err) => (err ? reject(err) : resolve())))
}

const runOnly = process.env.EXODUS_TEST_ONLY === '1'

async function runContext(context) {
  const { options, children, hooks, fn } = context
  assert(!context.running, 'Can not run twice')
  // eslint-disable-next-line @exodus/mutable/no-param-reassign-prop-only
  context.running = true
  assert(children.length === 0 || !fn)
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
    for (const c of stack) for (const hook of c.hooks.beforeEach) await runFunction(hook, context)
    const guard = { id: null, failed: false }
    guard.promise = new Promise((resolve) => {
      guard.id = setTimeout(() => {
        guard.failed = true
        resolve()
      }, options.timeout || 5000)
    })
    try {
      await Promise.race([guard.promise, runFunction(fn, context)])
      if (guard.failed) throw new Error('timeout reached')
    } catch (e) {
      error = e ?? 'Unknown error'
    }

    clearTimeout(guard.id)
    stack.reverse()
    for (const c of stack) for (const hook of c.hooks.afterEach) await runFunction(hook, context)

    print(error === undefined ? '✔ PASS' : '✖ FAIL', context.fullName)
    if (error) {
      print(' ', error)
      abstractProcess.exitCode = 1
    }
  } else {
    if (options.only && !runOnly) {
      print(`⚠ WARN describe.only requires the --only command-line option`)
    }

    // if (context !== context.root) print(`▶ ${context.fullName}`)
    // TODO: try/catch for hooks?
    // TODO: flatten recursion before running?
    for (const hook of hooks.before) await runFunction(hook, context)
    for (const child of children) await runContext(child)
    for (const hook of hooks.after) await runFunction(hook, context)
    // if (context !== context.root) print(`▶ ${context.fullName}`)
  }
}

async function run() {
  assert(!running)
  running = true
  assert(context === context.root)
  await runContext(context).catch((error) => {
    // Should not throw under regular circumstances
    print('‼ FATAL', error)
    abstractProcess.exitCode = 1
  })
  abstractProcess._maybeProcessExitCode?.()
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

class MockTimers {
  #enabled = false
  #base = 0
  #elapsed = 0
  #queue = []
  enable({ now = 0, apis = ['setInterval', 'setTimeout', 'setImmediate', 'Date'] } = {}) {
    assert(!this.#enabled, 'MockTimers is already enabled!')
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
    let shouldAwait = true
    for (let i = 0; i < milliseconds; i++) {
      if (shouldAwait) await awaitForMicrotaskQueue()
      this.#elapsed += 1
      shouldAwait = this.#microtick() !== null
      if (shouldAwait) while (this.#microtick() !== null);
    }
  }

  #microtick() {
    const next =
      this.#queue.find((x) => x.runAt === -1) || // immediates are first
      this.#queue.find((x) => x.runAt <= this.#elapsed)
    if (!next) return null
    if (next.interval === undefined) {
      this.#queue = this.#queue.filter((x) => x !== next)
    } else {
      next.runAt += next.interval
    }

    next.callback(...next.args)
  }

  runAll() {
    this.tick(Math.max(0, ...this.#queue.map((x) => x.runAt - this.#elapsed)))
  }

  setTime(milliseconds) {
    this.#base = milliseconds
  }

  #setTimeout(callback, delay, ...args) {
    const id = { callback, runAt: delay + this.#elapsed, args }
    this.#queue.push(id)
    return id
  }

  #setInterval(callback, delay, ...args) {
    const id = { callback, runAt: delay + this.#elapsed, interval: delay, args }
    this.#queue.push(id)
    return id
  }

  #setImmediate(callback, ...args) {
    const id = { callback, runAt: -1, args }
    this.#queue.push(id)
    return id
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
      get callCount() {
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

if (process.env.EXODUS_TEST_ENGINE === 'node:pure') {
  // Try load module mocks from node:test, if present
  try {
    const nodeTest = require('node:test')
    mock.module = nodeTest.mock.module.bind(nodeTest.mock)
  } catch {}
}

const beforeEach = (fn) => context.hooks.beforeEach.push(fn)
const afterEach = (fn) => context.hooks.afterEach.push(fn)
const before = (fn) => context.hooks.before.push(fn)
const after = (fn) => context.hooks.after.push(fn)

const isPromise = (x) => Boolean(x && x.then && x.catch && x.finally)
const nodeVersion = '9999.99.99'
const awaitForMicrotaskQueue = async () => {
  if (globalThis?.process?.nextTick) {
    // We are in microtasks, awaiting for "next" tick will get us out of here
    return new Promise((resolve) => globalThis.process.nextTick(resolve))
  }

  // If that is not available, we can wait for the actual next cycle
  // For Hermes, we use -Xmicrotask-queue for this to act not like just a Promise.resolve().then(
  // TODO: recheck if setImmediate is not faked with setTimeout if we enable a polyfill for it for JSC?
  if (setImmediate) return new Promise((resolve) => setImmediate(resolve))

  // Do not rely on setTimeout here! it will tick actual time and is terribly slow (i.e. timers no longer fake)
  // 100_000 should be enough to flush everything that's going on in the microtask queue
  // Only JSC hits this currently
  for (let i = 0; i < 100_000; i++) await Promise.resolve()
}

let builtinModules = []
let requireIsRelative = false
let relativeRequire, isTopLevelESM, syncBuiltinESMExports, readSnapshot, utilFormat
if (process.env.EXODUS_TEST_ENVIRONMENT === 'bundle') {
  // eslint-disable-next-line no-undef
  const files = EXODUS_TEST_FILES
  const baseFile = files.length === 1 ? files[0] : undefined
  isTopLevelESM = () => false
  // eslint-disable-next-line no-undef
  const bundleSnaps = typeof EXODUS_TEST_SNAPSHOTS !== 'undefined' && new Map(EXODUS_TEST_SNAPSHOTS)
  const resolveSnapshot = (f) => snapshotResolver(f[0], f[1]).join('/')
  readSnapshot = (f = baseFile) => (f ? bundleSnaps.get(resolveSnapshot(f)) : null)
  utilFormat = require('./bundle-apis/util-format.cjs')
} else {
  const { existsSync, readFileSync } = require('node:fs')
  const { dirname, basename, normalize, join } = require('node:path')
  const nodeModule = require('node:module')
  const files = process.argv.slice(1)
  const baseFile = files.length === 1 && existsSync(files[0]) ? normalize(files[0]) : undefined
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
const setSnapshotSerializers = () => {}
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
  ...{ requireIsRelative, relativeRequire, isTopLevelESM },
  ...{ readSnapshot, setSnapshotSerializers, setSnapshotResolver },
}
/* eslint-enable unicorn/no-useless-spread */
