import {
  beforeEach,
  assert,
  setSnapshotResolver,
  setSnapshotSerializers,
  readSnapshot,
  relativeRequire,
} from './engine.js'
import { formatWithAllPlugins } from './pretty-format.cjs'
import { jestConfig } from './jest.config.js'
import { getTestNamePath } from './dark.cjs'
import { matchSnapshot } from './engine.pure.snapshot.cjs'

const { snapshotFormat, snapshotSerializers } = jestConfig()
const plugins = []
const serialize = (val) =>
  formatWithAllPlugins(val, { ...snapshotFormat, plugins }).replaceAll(/\r\n|\r/gu, '\n')

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
  setSnapshotResolver((dir, name) => [dir, '__snapshots__', `${name}.snap`])
  setSnapshotSerializers([serialize])
  maybeSetupSerializers()
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

// Older Node.js versions do not have context.assert, which we want to prefer for counting
let context
beforeEach((t) => (context = t))
const getAssert = () => context?.assert ?? assert // do not use non-strict comparisons on this!

// Wrap reported context.fullName so that snapshots are placed/looked for under jest-compatible keys
function wrapContextName(fn, snapshotName) {
  if (context.fullName === context.name && !snapshotName) return fn() // fast path
  const value = context.fullName
  assert(snapshotName || (typeof value === 'string' && value.endsWith(` > ${context.name}`)))
  const SuiteContext = Object.getPrototypeOf(context)
  const fullNameDescriptor = Object.getOwnPropertyDescriptor(SuiteContext, 'fullName')
  assert(fullNameDescriptor && fullNameDescriptor.configurable)

  Object.defineProperty(context, 'fullName', {
    configurable: true,
    get() {
      assert.equal(this, context)
      const normalized = value.replaceAll(' > ', ' ').replaceAll('<anonymous>', '')
      return snapshotName ? `${normalized}: ${snapshotName}` : normalized
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
  let trimmed = inline.trim()
  const prefix = inline.slice(0, inline.indexOf(trimmed)).split('\n').find(Boolean)
  if (prefix && /^[ \t]+$/u.test(prefix)) trimmed = trimmed.replaceAll(`\n${prefix}`, '\n')
  getAssert().strictEqual(serialize(obj).trim(), trimmed)
}

const deepMerge = (obj, matcher) => {
  if (!obj || !matcher) return matcher
  const [proto, pm] = [Object.getPrototypeOf(obj), Object.getPrototypeOf(matcher)]
  if (proto === pm && Array.prototype === proto) return obj.map((v, i) => deepMerge(v, matcher[i])) // extra length is caught in toMatchObject
  if (![proto, pm].every((p) => [Object.prototype, null].includes(p))) return matcher
  // all matcher keys should be already in obj, as verified by toMatchObject prior to this
  const map = new Map(Object.entries(matcher))
  const merge = (key, value) => [key, map.has(key) ? deepMerge(value, map.get(key)) : value]
  const res = Object.fromEntries(Object.entries(obj).map(([key, value]) => merge(key, value)))
  Object.setPrototypeOf(res, proto)
  return res
}

const snapOnDisk = (expect, orig, matcherOrSnapshotName, snapshotName) => {
  const matcher = typeof matcherOrSnapshotName === 'object' ? matcherOrSnapshotName : undefined
  const name = typeof matcherOrSnapshotName === 'string' ? matcherOrSnapshotName : snapshotName

  if (matcher) {
    expect(orig).toMatchObject(matcher)
    // If we passed, make appear that the above call never happened
    const state = expect.getState()
    state.assertionCalls--
    state.numPassingAsserts--
  }

  const obj = matcher ? deepMerge(orig, matcher) : orig

  maybeSetupJestSnapshots()

  if (!context?.assert?.snapshot) {
    const namePath = getTestNamePath(context).map((x) => (x === '<anonymous>' ? '' : x))
    const qualified = name ? [...namePath.slice(0, -1), `${namePath.at(-1)}: ${name}`] : namePath
    return matchSnapshot(readSnapshot, getAssert(), qualified.join(' '), serialize(obj))
  }

  // Node.js always wraps with newlines, while jest wraps only those that are already multiline
  try {
    wrapContextName(() => context.assert.snapshot(obj), name)
  } catch (e) {
    if (typeof e.expected === 'string') {
      const final = e.expected.includes('\n') ? e.expected : `\n${e.expected}\n`
      if (final === e.actual) return
    }

    throw e
  }
}

export function setupSnapshots(expect) {
  expect.extend({
    toMatchInlineSnapshot: (obj, i) => wrap(() => snapInline(obj, i)),
    toMatchSnapshot: (obj, matcher) => wrap(() => snapOnDisk(expect, obj, matcher)),
    toThrowErrorMatchingInlineSnapshot: (...a) => wrap(() => throws(a, (m) => snapInline(m, a[1]))),
    toThrowErrorMatchingSnapshot: (...a) => wrap(() => throws(a, (m) => snapOnDisk(expect, m))),
  })

  // eslint-disable-next-line @exodus/mutable/no-param-reassign-prop-only
  expect.addSnapshotSerializer = (plugin) => plugins.push(plugin)
}
