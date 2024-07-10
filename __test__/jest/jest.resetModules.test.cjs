test('jest.resetModels', () => {
  const a = require('c8')
  a.foo = 'bar'
  expect(a.foo).toBe('bar')

  const b = require('c8')
  expect(a).toBe(b)
  expect(b.foo).toBe('bar')

  jest.resetModules()

  const c = require('c8')
  expect(c).not.toBe(a)
  expect(c).not.toBe(b)
  expect(c.foo).toBe(undefined)

  expect(a).toBe(b)
  expect(b.foo).toBe('bar')

  const d = require('c8')
  expect(d).not.toBe(a)
  expect(d).not.toBe(b)
  expect(d).toBe(c)
})
