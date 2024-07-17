const number = require('./fixtures/number.cjs')
const object = require('./fixtures/object.cjs')
const classobject = require('./fixtures/classobject.cjs')
const subclassobject = require('./fixtures/subclassobject.cjs')

test('number', () => {
  jest.mock('./fixtures/number.cjs')
  expect(number).toBe(42)
})

test('object', () => {
  jest.mock('./fixtures/object.cjs')
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

test('classobject', () => {
  jest.mock('./fixtures/classobject.cjs')
  expect(classobject.something).toBe('fun')
  expect(classobject.bar()).toBe(undefined)
  expect(() => classobject.not()).toThrow()
})

test('subclassobject', () => {
  jest.mock('./fixtures/subclassobject.cjs')
  expect(subclassobject.hi()).toBe(undefined)
  expect(subclassobject.why()).toBe(undefined)
  expect(subclassobject.overridden()).toBe(undefined)
  expect(() => subclassobject.foo()).toThrow()
  expect(subclassobject.two).toBe(2)
  expect(subclassobject.one).toBe(1)
  expect(subclassobject.common).toBe('high')
  expect(Object.getPrototypeOf(subclassobject)).toBe(Object.prototype) // flattened!
})
