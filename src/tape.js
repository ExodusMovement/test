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

  // specially handled ones as do not exist in t.assert
  notOk: ['notOk', 'false', 'notok'],
  pass: ['pass'],
  error: ['error', 'ifError', 'ifErr', 'iferror'], // tape
  assertion: ['assertion'], // tape

  // match/notMatch are confusing as operate on strings in some impls and objs in others. we skip them
}

function tapeWrapAssert(t) {
  // Note: we must use t.assert instead of assert everywhere as we have t.plan

  const api = {
    test: tapeWrap(t.test.bind(t)),
    plan: (...r) => t.plan(...r),
    skip: (...r) => t.skip(...r),
    todo: (...r) => t.todo(...r),
    comment: (...r) => t.diagnostic(...r),
    end: () => {},
  }

  // Copy implementations from here if they exist, preferring over t.assert
  const base = {
    pass: (...r) => t.assert.ok(true, ...r),
    notOk: (x, ...r) => t.assert.ok(!x, ...r),
    error: (err, msg) => t.assert.ok(!err, msg || err?.message),
    assertion: (fn, ...args) => fn.apply(t.assert, args),
  }

  for (const [key, names] of Object.entries(aliases)) {
    const impl = Object.hasOwn(base, key) ? base[key] : (...r) => t.assert[key](...r)
    Object.assign(api, Object.fromEntries(names.map((name) => [name, impl])))
  }

  return api
}

function tapeWrap(test) {
  const tap = (name, ...args) => {
    const fn = args.pop()
    assert(args.length <= 1)
    const [opts = {}] = args
    verifyOptions(opts)
    test(name, opts, (t) => fn(tapeWrapAssert(t)))
  }

  tap.skip = (...args) => test.skip(...args)
  return tap
}

export const tape = tapeWrap(test)
