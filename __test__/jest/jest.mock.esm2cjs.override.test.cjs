const index = require('./fixtures/esm2cjs/index.js')
const { named, mixed } = index // These can be destructured early

test('object', async () => {
  jest.mock('./fixtures/esm2cjs/object.js')
  const object = index.object // Can not be destructured early
  expect(object.value).toBe(20)
  expect(object.hello).toBe('world')
  expect(object.call()).toBe(undefined)
  expect(() => object.none()).toThrow()
  expect(object.stringobj).toBeInstanceOf(String)
  expect(`${object.stringobj}`).toBe('hello')
  expect(object.arr).toBeInstanceOf(Array)
  // jest is weird for the below, but let's follow that
  expect(object.arr.length).toBe(0)
})

test('function', async () => {
  jest.mock('./fixtures/esm2cjs/function.js')
  const fn = index.fn // Can not be destructured early
  expect(fn()).toBe(undefined)
})

test('class', async () => {
  jest.mock('./fixtures/esm2cjs/class.js')
  const Class = index.Class // Can not be destructured early
  const obj = new Class()
  expect(obj.foo()).toBe(undefined)
  expect(() => obj.buz()).toThrow()
  expect(obj.bar).toBe(10)
  expect(obj.value).toBe(undefined)
})

test('named', async () => {
  jest.mock('./fixtures/esm2cjs/named.js')
  expect(named.__esModule).toBe(true)
  expect(named.x).toBe(20)
  expect(named.y).toBe(undefined)
  expect(named.hi()).toBe(undefined)
  expect(() => named.no()).toThrow()
})

test('mixed', async () => {
  jest.mock('./fixtures/esm2cjs/mixed.js')
  expect(mixed.__esModule).toBe(true)
  expect(mixed.a).toBe('A')
  expect(mixed.y).toBe(21)
  expect(mixed.hello()).toBe(undefined)
  expect(() => mixed.default.hi()).toThrow()
  expect(mixed.default.b).toBe('B')
  expect(mixed.default.y).toBe('in obj')
  expect(mixed.default.why()).toBe(undefined)
  expect(() => mixed.default.no()).toThrow()
})
