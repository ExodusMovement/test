const esmInCJS =
  jest.exodus.features.esmInterop ||
  (jest.exodus.features.dynamicRequire && globalThis.process?.features?.require_module)
const have = !jest.exodus || (jest.exodus.features.esmMocks && esmInCJS)
const describeMocks = have ? describe : describe.skip

describeMocks('esm2cjs from esm', () => {
  test('object', async () => {
    jest.mock('../../fixtures/esm2cjs/object.js')
    const { default: object } = await import('../../fixtures/esm2cjs/object.js')
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
    jest.mock('../../fixtures/esm2cjs/function.js')
    const { default: fn } = await import('../../fixtures/esm2cjs/function.js')
    expect(fn()).toBe(undefined)
  })

  test('class', async () => {
    jest.mock('../../fixtures/esm2cjs/class.js')
    const { default: Class } = await import('../../fixtures/esm2cjs/class.js')
    const obj = new Class()
    expect(obj.foo()).toBe(undefined)
    expect(() => obj.buz()).toThrow()
    expect(obj.bar).toBe(10)
    expect(obj.value).toBe(undefined)
  })

  test('named', async () => {
    jest.mock('../../fixtures/esm2cjs/named.js')
    const named = await import('../../fixtures/esm2cjs/named.js')
    expect(named.x).toBe(20)
    expect(named.y).toBe(undefined)
    expect(named.hi()).toBe(undefined)
    expect(() => named.no()).toThrow()
  })

  test('mixed', async () => {
    jest.mock('../../fixtures/esm2cjs/mixed.js')
    const mixed = await import('../../fixtures/esm2cjs/mixed.js')
    expect(mixed.a).toBe('A')
    expect(mixed.y).toBe(21)
    expect(mixed.hello()).toBe(undefined)
    expect(() => mixed.default.hi()).toThrow()
    expect(mixed.default.b).toBe('B')
    expect(mixed.default.y).toBe('in obj')
    expect(mixed.default.why()).toBe(undefined)
    expect(() => mixed.default.no()).toThrow()
  })
})
