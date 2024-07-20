const assert = require('node:assert/strict')
const assertLoose = require('node:assert')
const { existsSync, readFileSync } = require('node:fs')
const { normalize, basename, dirname, join: pathJoin } = require('node:path')
const { format: utilFormat } = require('node:util')
const { createRequire, builtinModules, syncBuiltinESMExports } = require('node:module')

const { setImmediate } = globalThis

Error.stackTraceLimit = 100

let context
let running
let immediate

function parseArgs(args) {
  assert(args.length <= 3)
  const name = typeof args[0] === 'string' ? args.shift() : 'test'
  const fn = args.pop()
  const options = args.pop() || {}
  return { name, options, fn }
}

function enterContext(name, options = {}) {
  assert(!running)
  clearImmediate(immediate)
  context = {
    root: context?.root,
    parent: context,
    name,
    options,
    fullName: context && context !== context.root ? `${context.fullName} > ${name}` : name,
    assert: { ...assertLoose, snapshot: undefined },
    hooks: { __proto__: null, before: [], after: [], beforeEach: [], afterEach: [] },
    test, // todo: bind to context
    describe, // todo: bind to context
    children: [],
  }
  if (context.root) {
    context.parent.children.push(context)
  } else {
    assert((context.name = '<root>'))
    assert(!context.parent)
    context.root = context
  }
}

function exitContext() {
  assert(context !== context.root)
  context = context.parent
  if (context === context.root) immediate = setImmediate(run)
}

async function runFunction(fn, context) {
  if (fn.length < 2) return fn(context)
  return new Promise((resolve, reject) => fn(context, (err) => (err ? reject(err) : resolve())))
}

async function runContext(context) {
  const { options, children, hooks, fn } = context
  assert(!context.running, 'Can not run twice')
  // eslint-disable-next-line @exodus/mutable/no-param-reassign-prop-only
  context.running = true
  assert(children.length === 0 || !fn)
  if (options.skip) return console.log('⏭ SKIP', context.fullName)
  if (context.fn) {
    let error
    const stack = [context]
    while (stack[0].parent) stack.unshift(stack[0].parent)

    // TODO: try/catch for hooks?
    for (const c of stack) for (const hook of c.hooks.beforeEach) await runFunction(hook, context)
    try {
      await runFunction(fn, context)
    } catch (e) {
      error = e ?? 'Unknown error'
    }

    stack.reverse()
    for (const c of stack) for (const hook of c.hooks.afterEach) await runFunction(hook, context)

    console.log(error === undefined ? '✔ PASS' : '✖ FAIL', context.fullName)
    if (error) {
      console.log(' ', error)
      if (globalThis.process) globalThis.process.exitCode = 1
    }
  } else {
    // if (context !== context.root) console.log(`▶ ${context.fullName}`)
    // TODO: try/catch for hooks?
    // TODO: flatten recursion before running?
    for (const hook of hooks.before) await runFunction(hook, context)
    for (const child of children) await runContext(child)
    for (const hook of hooks.after) await runFunction(hook, context)
    // if (context !== context.root) console.log(`▶ ${context.fullName}`)
  }
}

async function run() {
  assert(!running)
  running = true
  assert(context === context.root)
  runContext(context).catch((error) => {
    // Should not throw under regular circumstances
    console.log('Fatal: ', error)
    if (globalThis.process) globalThis.process.exitCode = 1
  })
}

function describe(...args) {
  const { name, options, fn } = parseArgs(args)
  enterContext(name, options)
  context.options = options
  if (!options.skip) fn(context) // todo: callback
  exitContext()
}

describe.skip = (...args) => {
  const { name, options, fn } = parseArgs(args)
  return describe(name, { ...options, skip: true }, fn)
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

class MockedFunction extends Function {
  get mock() {
    return this._mock
  }
}

const mock = {
  module: undefined,
  timers: undefined,
  fn: (original = () => {}, implementation = original) => {
    let impl = implementation
    const mocked = function (...args) {
      const call = {
        arguments: args,
        // eslint-disable-next-line unicorn/error-message
        stack: new Error(), // todo: recheck location
        target: undefined,
        this: this,
      }

      mocked.mock.calls.push(call)

      try {
        // todo: what's if it a promise
        if (this instanceof mocked) {
          impl.apply(this, args)
          call.result = call.target = this
        } else {
          call.result = impl.apply(this, args)
        }

        call.error = undefined
      } catch (err) {
        call.result = undefined
        call.error = err
        throw err
      }

      return call.result
    }

    Object.setPrototypeOf(mocked, MockedFunction.prototype)

    mocked._mock = {
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
        mocked._mock.calls.length = 0
      },
      restore: () => {
        impl = original
      },
    }

    return mocked
  },
}

const beforeEach = (fn) => context.hooks.beforeEach.push(fn)
const afterEach = (fn) => context.hooks.afterEach.push(fn)
const before = (fn) => context.hooks.before.push(fn)
const after = (fn) => context.hooks.after.push(fn)

const isPromise = (x) => Boolean(x.then && x.catch && x.finally)
const nodeVersion = '9999.99.99'

const files = process.argv.slice(1)
const baseFile = files.length === 1 && existsSync(files[0]) ? normalize(files[0]) : undefined
const relativeRequire = baseFile ? createRequire(baseFile) : require
const isTopLevelESM = () => !baseFile || !Object.hasOwn(relativeRequire.cache, baseFile) // assume ESM otherwise

const snapshot = undefined
let snapshotResolver = (dir, name) => [dir, `${name}.snapshot`] // default per Node.js docs
const resolveSnapshot = (f) => pathJoin(...snapshotResolver(dirname(f), basename(f)))
const readSnapshot = (f = baseFile) => (f ? readFileSync(resolveSnapshot(f), 'utf8') : null)
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
  ...{ utilFormat, isPromise, nodeVersion },
  ...{ baseFile, relativeRequire, isTopLevelESM },
  ...{ snapshot, readSnapshot, setSnapshotSerializers, setSnapshotResolver },
}
/* eslint-enable unicorn/no-useless-spread */
