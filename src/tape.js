import assert from 'node:assert/strict'
import { test } from 'node:test'

const knownOptions = new Set(['skip', 'todo', 'concurrency'])

function verifyOptions(options) {
  for (const key of Object.keys(options)) {
    assert(knownOptions.has(key), `Unknown option: ${key}`)
  }
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
  doesNotReject: ['resolves'],

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

  const plannedAssert = () => t.assert || assert // has to be a method as .assert accesses are counted

  // Note: we must use plannedAssert instead of assert everywhere on user calls as we have t.plan
  const api = {
    test: tapeWrap(t.test.bind(t)),
    plan: (more) => {
      assert.equal(typeof more, 'number') // can not use plannedAssert here to not consume counter
      plan = more + count
      if (t.plan) t.plan(plan)
      track()
    },
    skip: (...r) => t.skip(...r),
    todo: (...r) => t.todo(...r),
    comment: (...r) => t.diagnostic(...r),
    end: () => {
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
    Object.assign(api, Object.fromEntries(names.map((name) => [name, (...r) => track(impl(...r))])))
  }

  return api
}

const AsyncFunction = (async () => {}).constructor

function tapeWrap(test) {
  const tap = (name, ...args) => {
    const fn = args.pop()
    assert(args.length <= 1)
    const [opts = {}] = args
    verifyOptions(opts)
    assert(fn instanceof Function)
    if (fn instanceof AsyncFunction) {
      test(name, opts, (t) => fn(tapeWrapAssert(t)))
    } else {
      test(name, opts, (t, callback) => fn(tapeWrapAssert(t, callback)))
    }
  }

  tap.skip = (...args) => test.skip(...args)
  return tap
}

export const tape = tapeWrap(test)
export default tape
