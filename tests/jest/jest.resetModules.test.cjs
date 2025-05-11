test('jest.resetModels', () => {
  const a = require('fast-glob')
  a.foo = 'bar'
  expect(a.foo).toBe('bar')

  const b = require('fast-glob')
  expect(a).toBe(b)
  expect(b.foo).toBe('bar')

  jest.resetModules()

  const c = require('fast-glob')
  expect(c).not.toBe(a)
  expect(c).not.toBe(b)
  expect(c.foo).toBe(undefined)

  expect(a).toBe(b)
  expect(b.foo).toBe('bar')

  const d = require('fast-glob')
  expect(d).not.toBe(a)
  expect(d).not.toBe(b)
  expect(d).toBe(c)
})
