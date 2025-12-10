it('simple', () => {
  expect(10).toMatchSnapshot()
  expect(null).toMatchSnapshot()
  expect().toMatchSnapshot()
  expect([]).toMatchSnapshot()
  expect(/xx/).toMatchSnapshot()
  expect(Infinity).toMatchSnapshot()
  expect(false).toMatchSnapshot()
  expect(true).toMatchSnapshot()
  expect({}).toMatchSnapshot()
})

it('complex', () => {
  expect([10]).toMatchSnapshot()
  expect([{ a: 10 }]).toMatchSnapshot()
  expect({ a: 10 }).toMatchSnapshot()
  expect({ a: 10, b: 20 }).toMatchSnapshot()
  expect(Buffer.from('')).toMatchSnapshot()
})

// repeat test name
it('simple', () => {
  expect(/hello/).toMatchSnapshot()
  expect(true).toMatchSnapshot()
  expect(NaN).toMatchSnapshot()
  expect({}).toMatchSnapshot()
  expect(42).toMatchSnapshot()
  expect([]).toMatchSnapshot()
  expect(-Infinity).toMatchSnapshot()
})

it('mixed', () => {
  expect(true).toMatchSnapshot()
  expect([1, 2, 3]).toMatchSnapshot()
  expect({ foo: 'bar' }).toMatchSnapshot()
  expect(43).toMatchSnapshot()
  expect({}).toMatchSnapshot()
  expect([]).toMatchSnapshot()
})

// repeat test name
it('mixed', () => {
  expect([5, 4, 3]).toMatchSnapshot()
  expect([]).toMatchSnapshot()
  expect(false).toMatchSnapshot()
  expect(41).toMatchSnapshot()
  expect({ bar: 'buz' }).toMatchSnapshot()
  expect({}).toMatchSnapshot()
})

it('simple inline', () => {
  expect(42).toMatchInlineSnapshot(`42`)
  expect({}).toMatchInlineSnapshot(`{}`)
})

it('escape', () => {
  expect('\\').toMatchSnapshot()
  expect('${').toMatchSnapshot()
  expect('$$\\${').toMatchSnapshot()
})

const TEST_ONE = { a: 20, d: Buffer.from('foo'), b: [1, 2, 'bar', 5], e: { foo: 'bar' } }
// eslint-disable-next-line no-sparse-arrays
const TEST_TWO = { ['__proto__']: [], b: [1, 2, , , 5], e: { foo: 'bar' }, f: -Infinity }
const TEST_THREE = [new Error('?!'), new TypeError('bar'), new Uint16Array([4, 2, 65_123]), null]

// Test names repeat on a purpose!

it('test A', () => {
  expect(TEST_ONE).toMatchSnapshot()
})

it('test B', () => {
  expect(TEST_TWO).toMatchSnapshot()
})

it('test B', () => {
  expect(TEST_THREE).toMatchSnapshot()
})

// Repeat name
it('test B', () => {
  expect({ x: 1337 }).toMatchSnapshot()
})

describe('nested test', () => {
  it('test A', () => {
    expect(TEST_TWO).toMatchSnapshot()
  })

  it('test A', () => {
    expect(TEST_THREE).toMatchSnapshot()
  })

  it('nested test one', () => {
    expect(TEST_ONE).toMatchSnapshot()
  })
})

it('test one, inline', () => {
  // eslint-disable-next-line unicorn/template-indent
  expect(TEST_ONE).toMatchInlineSnapshot(`
{
  "a": 20,
  "b": [
    1,
    2,
    "bar",
    5,
  ],
  "d": {
    "data": [
      102,
      111,
      111,
    ],
    "type": "Buffer",
  },
  "e": {
    "foo": "bar",
  },
}
`)
})

it('errors', () => {
  expect(() => {
    throw new TypeError('Whoops\nI\nFailed')
  }).toThrowErrorMatchingSnapshot()

  expect(() => {
    throw new RangeError('Out of something')
  }).toThrowErrorMatchingInlineSnapshot('"Out of something"')
})

it('async errors', async () => {
  await expect(Promise.reject(new TypeError('slow but nah'))).rejects.toThrowErrorMatchingSnapshot()
  await expect(Promise.resolve(new Error('ok'))).resolves.toThrowErrorMatchingInlineSnapshot('"ok"')
})

it('formateted objects', () => {
  expect(expect.any(Number)).toMatchSnapshot()
  expect({ a: expect.any(Number), b: expect.any(String) }).toMatchSnapshot()
})

describe('weird  names', () => {
  const ascii = Array.from({ length: 128 })
    .fill()
    .map((a, i) => i)
    .slice(0x20)
    .map((i) => String.fromCodePoint(i))
    .join('')
  for (const key of [
    '\n',
    '{}',
    '$',
    '`',
    '>',
    '` ` `',
    '` `\n `',
    '\\',
    '\\\n`\n\\``',
    '${',
    ascii,
  ]) {
    it(key, () => {
      expect(key).toMatchSnapshot()
    })
  }

  it('multi\nline', () => {
    expect(0).toMatchSnapshot()
  })

  it('with `', () => {
    expect(42).toMatchSnapshot()
  })
})

// https://jestjs.io/docs/snapshot-testing#property-matchers

describe('property matchers', () => {
  it('will check the matchers and pass', () => {
    expect.assertions(1) // ensure we don't over-consume

    const user = {
      createdAt: new Date(),
      id: Math.floor(Math.random() * 20),
      name: 'LeBron James',
    }

    expect(user).toMatchSnapshot({
      createdAt: expect.any(Date),
      id: expect.any(Number),
    })
  })

  it('will check the values and pass', () => {
    expect.assertions(1) // ensure we don't over-consume

    const user = {
      createdAt: new Date(),
      name: 'Bond... James Bond',
    }

    expect(user).toMatchSnapshot({
      createdAt: expect.any(Date),
      name: 'Bond... James Bond',
    })
  })
})

describe('', () => {
  it('', () => {
    expect('empty names test').toMatchSnapshot()
  })
})

test('deep matcher', () => {
  expect({
    one: 1,
    foo: {
      bar: {
        property: 'value 123',
        uuid: typeof crypto === 'undefined' ? 'hey Node.js 18' : crypto.randomUUID(),
      },
    },
  }).toMatchSnapshot({ foo: { bar: { uuid: expect.any(String) } } })
})

test('arrays', () => {
  expect([Math.random(), { a: 20 }]).toMatchSnapshot([expect.any(Number), {}])
  expect(['foo']).toMatchSnapshot([expect.any(String)])
  expect({ x: ['bar'], y: 10 }).toMatchSnapshot({ x: [expect.any(String)] })
  expect({ x: [{ a: 'baz', b: 20 }], y: 10 }).toMatchSnapshot({ x: [{ a: expect.any(String) }] })
  expect([{ x: [{ a: 'some', b: 20 }, { extra: 42 }], y: 10 }, { k: 1 }]).toMatchSnapshot([
    {
      x: [{ a: expect.any(String) }, {}],
    },
    {},
  ])
})

test('inline snapshots, prefixed', () => {
  // eslint-disable-next-line unicorn/template-indent
  expect({ a: 10, c: [1, 2], b: 20 }).toMatchInlineSnapshot(`
{
  "a": 10,
  "b": 20,
  "c": [
    1,
    2,
  ],
}
`)

  // eslint-disable-next-line unicorn/template-indent
  expect({ a: 10, c: [1, 2], b: 20 }).toMatchInlineSnapshot(`
  {
    "a": 10,
    "b": 20,
    "c": [
      1,
      2,
    ],
  }
          `) // end padding is ignored!
})

it('supports named snapshots', async () => {
  expect({ name: 'Bruce Wayne' }).toMatchSnapshot('public knowledge')
  expect({ alterEgo: 'Batman', name: 'Bruce Wayne' }).toMatchSnapshot('not so public knowledge')
  expect({ name: 'Joker', address: 'Arkham Asylum' }).toMatchSnapshot('public knowledge')

  // Additionally recheck named snapshot presence

  let snapshots
  try {
    const { createRequire } = await import('node:module')
    const require = createRequire(import.meta.url)
    snapshots = require('./__snapshots__/snapshot.test.js.snap')
  } catch {
    // skip the rest of this test for environments without dynamic node:module
    return
  }

  if (Object.keys(snapshots).join(',') === 'default') return // Bun can't load .snap that way
  ;[
    'supports named snapshots: public knowledge 1',
    'supports named snapshots: public knowledge 2',
    'supports named snapshots: not so public knowledge 1',
  ].forEach((name) => {
    expect(Object.hasOwn(snapshots, name)).toBe(true)
  })
})
