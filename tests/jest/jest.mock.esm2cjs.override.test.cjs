const have = !jest.exodus || jest.exodus.features.esmInterop
const describeMocks = have ? describe : describe.skip

describeMocks('esm2cjs from cjs, overriding pre-required imports', () => {
  const index = require('./fixtures/esm2cjs/index.js')
  const { all } = require('./fixtures/esm2cjs/index-function.js')
  const { named: namedEarly, mixed: mixedEarly } = index // These can be destructured early

  all() // check that early calls don't hurt

  test('object', async () => {
    jest.mock('./fixtures/esm2cjs/object.js')
    // Can not be destructured early
    for (const object of [index.object, all().object]) {
      expect(object.value).toBe(20)
      expect(object.hello).toBe('world')
      expect(object.call()).toBe(undefined)
      expect(() => object.none()).toThrow()
      expect(object.stringobj).toBeInstanceOf(String)
      expect(`${object.stringobj}`).toBe('hello')
      expect(object.arr).toBeInstanceOf(Array)
      // jest is weird for the below, but let's follow that
      expect(object.arr.length).toBe(0)
    }
  })

  test('function', async () => {
    jest.mock('./fixtures/esm2cjs/function.js')
    // Can not be destructured early
    for (const fn of [index.fn, all().fn]) {
      expect(fn()).toBe(undefined)
    }
  })

  test('class', async () => {
    jest.mock('./fixtures/esm2cjs/class.js')
    // Can not be destructured early
    for (const Class of [index.Class, all().Class]) {
      const obj = new Class()
      expect(obj.foo()).toBe(undefined)
      expect(() => obj.buz()).toThrow()
      expect(obj.bar).toBe(10)
      expect(obj.value).toBe(undefined)
    }
  })

  test('named', async () => {
    jest.mock('./fixtures/esm2cjs/named.js')
    for (const named of [index.named, all().named, namedEarly]) {
      expect(named.__esModule).toBe(true)
      expect(named.x).toBe(20)
      expect(named.y).toBe(undefined)
      expect(named.hi()).toBe(undefined)
      expect(() => named.no()).toThrow()
    }
  })

  test('mixed', async () => {
    jest.mock('./fixtures/esm2cjs/mixed.js')
    for (const mixed of [index.mixed, all().mixed, mixedEarly]) {
      expect(mixed.__esModule).toBe(true)
      expect(mixed.a).toBe('A')
      expect(mixed.y).toBe(21)
      expect(mixed.hello()).toBe(undefined)
      expect(() => mixed.default.hi()).toThrow()
      expect(mixed.default.b).toBe('B')
      expect(mixed.default.y).toBe('in obj')
      expect(mixed.default.why()).toBe(undefined)
      expect(() => mixed.default.no()).toThrow()
    }
  })
})
