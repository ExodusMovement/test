import { beforeEach } from 'node:test'
import { createRequire } from 'node:module'
import { expect } from 'expect'
import { format } from 'pretty-format'
import assert from 'node:assert/strict'
import { basename, dirname, join } from 'node:path'
import { jestConfig } from './jest.config.js'
import { relativeRequire } from './jest.mock.js'

const { snapshotFormat, snapshotSerializers } = jestConfig()
const plugins = []
const serialize = (val) => format(val, { ...snapshotFormat, plugins }).replaceAll(/\r\n|\r/gu, '\n')

let serializersAreSetup = false
let snapshotsAreJest = false

function maybeSetupSerializers() {
  if (serializersAreSetup) return
  // empty require and serializers should not let this fail, non-empty serializers and empty require should
  if (snapshotSerializers.length > 0) plugins.push(...snapshotSerializers.map(relativeRequire))
  serializersAreSetup = true
}

// We want to setup snapshots to behave like jest only when first used from jest API
function maybeSetupJestSnapshots() {
  if (snapshotsAreJest) return
  maybeSetupSerializers()
  const require = createRequire(import.meta.url)
  const { snapshot } = require('node:test') // attempt to load them, and we need to do that synchronously
  assert(snapshot, 'snapshots require Node.js >=22.3.0')
  snapshot.setDefaultSnapshotSerializers([serialize])
  snapshot.setResolveSnapshotPath((f) => join(dirname(f), '__snapshots__', `${basename(f)}.snap`))
  snapshotsAreJest = true
}

const wrap = (check) => {
  try {
    check()
    return { pass: true }
  } catch (e) {
    return { pass: false, message: () => e.message }
  }
}

let context
beforeEach((t) => (context = t))
const getAssert = () => context?.assert ?? assert // do not use non-strict comparisons on this!

// Wrap reported context.fullName so that snapshots are placed/looked for under jest-compatible keys
function wrapContextName(fn) {
  if (context.fullName === context.name) return fn() // fast path
  const value = context.fullName
  assert(typeof value === 'string' && value.endsWith(` > ${context.name}`))
  const SuiteContext = Object.getPrototypeOf(context)
  const fullNameDescriptor = Object.getOwnPropertyDescriptor(SuiteContext, 'fullName')
  assert(fullNameDescriptor && fullNameDescriptor.configurable)
  Object.defineProperty(context, 'fullName', {
    configurable: true,
    get() {
      assert.equal(this, context)
      return value.replaceAll(' > ', ' ')
    },
  })
  try {
    return fn()
  } finally {
    assert.notEqual(context.fullName, value)
    delete context.fullName
    assert.equal(context.fullName, value)
  }
}

const throws = ([fn, , wrapped], check) => {
  if (wrapped) {
    // Seems that we got unwrapped promise result
    // We need to be careful to not consume 2 assertion counters, so wrap with an if
    if (!(fn && fn instanceof Error)) getAssert().fail('Received function did not throw')
    return check(fn.message)
  }

  getAssert().throws(fn, (e) => {
    check(e.message) // jest stores only messages for errors
    return true
  })
}

const snapInline = (obj, inline) => {
  assert(inline !== undefined, 'Inline Snapshots generation is not supported')
  assert(typeof inline === 'string')
  maybeSetupSerializers()
  getAssert().strictEqual(serialize(obj).trim(), inline.trim())
}

const snapOnDisk = (obj) =>
  wrapContextName(() => {
    maybeSetupJestSnapshots()

    if (!serialize(obj).includes('\n')) {
      // Node.js always wraps with newlines, while jest wraps only those that are already multiline
      try {
        getAssert().snapshot(obj)
      } catch (e) {
        if (`\n${e.expected}\n` === e.actual) return
        throw e
      }
    }

    return getAssert().snapshot(obj)
  })

expect.extend({
  toMatchInlineSnapshot: (obj, i) => wrap(() => snapInline(obj, i)),
  toMatchSnapshot: (obj) => wrap(() => snapOnDisk(obj)),
  toThrowErrorMatchingInlineSnapshot: (...a) => wrap(() => throws(a, (m) => snapInline(m, a[1]))),
  toThrowErrorMatchingSnapshot: (...a) => wrap(() => throws(a, (m) => snapOnDisk(m))),
})

expect.addSnapshotSerializer = (plugin) => plugins.push(plugin)
