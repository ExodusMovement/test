it.skip('simple', () => {
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

it('simple inline', () => {
  expect(42).toMatchInlineSnapshot(`42`)
  expect({}).toMatchInlineSnapshot(`{}`)
})

const TEST_ONE = { a: 20, d: Buffer.from('foo'), b: [1, 2, 'bar', 5], e: { foo: 'bar' } }
// eslint-disable-next-line no-sparse-arrays
const TEST_TWO = { ['__proto__']: [], b: [1, 2, , , 5], e: { foo: 'bar' }, f: -Infinity }
const TEST_THREE = [new Error('foo'), new TypeError('bar'), new Uint16Array(4, 2, 1_000_000), null]

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
