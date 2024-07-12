import { beforeEach } from 'node:test'
import { createRequire } from 'node:module'
import { expect } from 'expect'
import { format } from 'pretty-format'
import assert from 'node:assert/strict'
import { basename, dirname, join } from 'node:path'

const plugins = []
const opts = { indent: 2, escapeRegex: true, printFunctionName: false, printBasicPrototype: false }
const serialize = (val) => format(val, { ...opts, plugins }).replaceAll(/\r\n|\r/gu, '\n')

let snapshotsAreJest = false

// We want to setup snapshots to behave like jest only when first used from jest API
function maybeSetupJestSnapshots() {
  if (snapshotsAreJest) return
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

const throws = (fn, check) =>
  getAssert().throws(fn, (e) => {
    check(e.message) // jest stores only messages for errors
    return true
  })

const snapInline = (obj, inline) => {
  assert(inline !== undefined, 'Inline Snapshots generation is not supported')
  assert(typeof inline === 'string')
  getAssert().strictEqual(serialize(obj).trim(), inline.trim())
}

const snapOnDisk = (obj) =>
  wrapContextName(() => {
    const str = serialize(obj)
    if (!str.includes('\n')) {
      // Node.js always wraps with newlines, while jest wraps only those that are already multiline
      // Hopefully, for simple objects there is no need to use snapshots and those can be just compared directly
      throw new Error(`Snapshots of primitives or empty objects/arrays is not supported: ${str}`)
    }

    maybeSetupJestSnapshots()
    return getAssert().snapshot(obj)
  })

expect.extend({
  toMatchInlineSnapshot: (obj, i) => wrap(() => snapInline(obj, i)),
  toMatchSnapshot: (obj) => wrap(() => snapOnDisk(obj)),
  toThrowErrorMatchingInlineSnapshot: (f, i) => wrap(() => throws(f, (msg) => snapInline(msg, i))),
  toThrowErrorMatchingSnapshot: (f) => wrap(() => throws(f, (msg) => snapOnDisk(msg))),
})

expect.addSnapshotSerializer = (plugin) => plugins.push(plugin)
