test('number', () => {
  jest.mock('./fixtures/number.cjs')
  const number = require('./fixtures/number.cjs')
  expect(number).toBe(42)
})

test('object', () => {
  jest.mock('./fixtures/object.cjs')
  const object = require('./fixtures/object.cjs')
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

test('function', () => {
  jest.mock('./fixtures/function.cjs')
  const fn = require('./fixtures/function.cjs')
  expect(fn()).toBe(undefined)
})

test('class', () => {
  jest.mock('./fixtures/class.cjs')
  const Class = require('./fixtures/class.cjs')
  const obj = new Class()
  expect(obj.foo()).toBe(undefined)
  expect(() => obj.buz()).toThrow()
  expect(obj.bar).toBe(10)
  expect(obj.value).toBe(undefined)
})

test('classobject', () => {
  jest.mock('./fixtures/classobject.cjs')
  const classobject = require('./fixtures/classobject.cjs')
  expect(classobject.something).toBe('fun')
  expect(classobject.bar()).toBe(undefined)
  expect(() => classobject.not()).toThrow()
})

test('subclass', () => {
  jest.mock('./fixtures/subclass.cjs')
  const Subclass = require('./fixtures/subclass.cjs')
  const obj = new Subclass()
  expect(obj.sub()).toBe(undefined)
  expect(obj.base()).toBe(undefined)
  expect(() => obj.foo()).toThrow()
  expect(Object.hasOwn(Subclass.prototype, 'base')).toBe(true) // flattened!
  expect(Object.getPrototypeOf(Subclass.prototype)).toBe(Object.prototype) // flattened!
  expect(obj.over).toBe('never')
  expect(obj.value).toBe('extended')
  expect(obj.space).toBe(undefined)
  expect(obj.something).toBe(undefined)
})

test('subclassobject', () => {
  jest.mock('./fixtures/subclassobject.cjs')
  const subclassobject = require('./fixtures/subclassobject.cjs')
  expect(subclassobject.hi()).toBe(undefined)
  expect(subclassobject.why()).toBe(undefined)
  expect(subclassobject.overridden()).toBe(undefined)
  expect(() => subclassobject.foo()).toThrow()
  expect(subclassobject.two).toBe(2)
  expect(subclassobject.one).toBe(1)
  expect(subclassobject.common).toBe('high')
  expect(Object.getPrototypeOf(subclassobject)).toBe(Object.prototype) // flattened!
})
