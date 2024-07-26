import { assert, assertLoose, test } from './engine.js'
import { createCallerLocationHook } from './dark.cjs'
import './version.js'

const knownOptions = new Set(['skip', 'todo', 'concurrency', 'timeout'])

function verifyOptions(options) {
  for (const key of Object.keys(options)) {
    assert(knownOptions.has(key), `Unknown option: ${key}`)
  }
}

// We don't seem to need it for jest, so let's let it live in this file
function cleanAssertError(e, where) {
  // eslint-disable-next-line @exodus/mutable/no-param-reassign-prop-only
  e.stack = e.stack
    .split('\n')
    .filter((x) => !x.startsWith(`at ${where}:`))
    .filter((x) => !x.includes(` (${where}:`))
    .filter((x) => !x.includes(` (node:async_hooks:`))
    .filter((x) => !x.includes(` (node:internal/test_runner`))
    .join('\n')
}

// key: assert method, values: names after which it'll be available
// note that it's not available by the original key unless explicitly listed in names
// e.g. we are strict by default
// We follow tape, not tap, i.e. same/notSame aliases are strict, and there are no special strict versions
// Most are taken from the doc: https://www.npmjs.com/package/tape#methods
const aliases = {
  __proto__: null,

  ok: ['ok', 'true', 'assert'],
  strictEqual: ['equal', 'equals', 'isEqual', 'strictEqual', 'strictEquals', 'is'],
  notStrictEqual: [
    'notEqual',
    'notEquals',
    'isNotEqual',
    'doesNotEqual',
    'isInequal',
    'notStrictEqual',
    'notStrictEquals',
    'isNot',
    'not',
  ],
  equal: ['looseEqual', 'looseEquals'],
  notEqual: ['notLooseEqual', 'notLooseEquals'],
  deepStrictEqual: ['deepEqual', 'deepEquals', 'isEquivalent', 'same'],
  notDeepStrictEqual: [
    'notDeepEqual',
    'notDeepEquals',
    'notEquivalent',
    'notDeeply',
    'notSame',
    'isNotDeepEqual',
    'isNotDeeply',
    'isNotEquivalent',
    'isInequivalent',
  ],
  deepEqual: ['deepLooseEqual'],
  notDeepEqual: ['notDeepLooseEqual'],
  throws: ['throws'],
  doesNotThrow: ['doesNotThrow'],
  fail: ['fail'],
  rejects: ['rejects'],
  doesNotReject: ['doesNotReject', 'resolves'],

  // specially handled ones as do not exist in t.assert / assert
  notOk: ['notOk', 'false', 'notok'],
  pass: ['pass'],
  error: ['error', 'ifError', 'ifErr', 'iferror'], // tape
  assertion: ['assertion'], // tape

  // match/notMatch are confusing as operate on strings in some impls and objs in others. we skip them
}

function tapeWrapAssert(t, callback) {
  // Auto-call api.end() on planned test count reaching zero
  let plan = null
  let count = 0
  const track = (...calls) => {
    count += calls.length
    if (plan === count) api.end()
    if (plan !== null) assert(plan >= count, `plan (${plan}) < count (${count})`)
  }

  const plannedAssert = () => (plan !== null && t.assert) || assertLoose // t.assert is cached and affected by t.plan

  // Note: we must use plannedAssert instead of assert everywhere on user calls as we have t.plan
  const api = {
    test: tapeWrap(t.test.bind(t)),
    plan: (total) => {
      assert.equal(typeof total, 'number')
      plan = total
      assert(plan >= count, `plan (${plan}) < count (${count})`)
      if (t.plan) t.plan(plan - count) // plan the remaining tests through node
      track()
    },
    skip: (...r) => t.skip(...r),
    todo: (...r) => t.todo(...r),
    comment: (...r) => t.diagnostic(...r),
    end: () => {
      if (plan !== null) assert.equal(plan, count, `plan (${plan}) !== count (${count})`)
      if (callback) callback()
      api.end = () => {}
    },
  }

  // Copy implementations from here if they exist, preferring over plannedAssert
  const base = {
    pass: (...r) => plannedAssert().ok(true, ...r),
    notOk: (x, ...r) => plannedAssert().ok(!x, ...r),
    error: (err, msg) => plannedAssert().ok(!err, msg || err?.message),
    assertion: (fn, ...args) => fn.apply(plannedAssert(), args),
  }

  for (const [key, names] of Object.entries(aliases)) {
    const impl = Object.hasOwn(base, key) ? base[key] : (...r) => plannedAssert()[key](...r)
    const wrap = (...r) => {
      try {
        return impl(...r)
      } catch (e) {
        cleanAssertError(e, import.meta.url)
        throw e
      }
    }

    Object.assign(api, Object.fromEntries(names.map((name) => [name, (...r) => track(wrap(...r))])))
  }

  return api
}

const AsyncFunction = (async () => {}).constructor

const { getCallerLocation, installLocationInNextTest } = createCallerLocationHook()

function tapeWrap(test) {
  const tap = (...args) => {
    const fn = args.pop()
    const name = args.shift() || 'test'
    assert(args.length <= 1)
    const [opts = {}] = args
    verifyOptions(opts)
    assert(fn instanceof Function)
    installLocationInNextTest(getCallerLocation())
    if (fn instanceof AsyncFunction) {
      test(name, opts, (t) => fn(tapeWrapAssert(t)))
    } else {
      test(name, opts, (t, callback) => fn(tapeWrapAssert(t, callback)))
    }
  }

  tap.skip = (...args) => test.skip(...args)
  if (test.only) tap.only = tapeWrap(test.only)
  return tap
}

export const tape = tapeWrap(test)
export default tape
