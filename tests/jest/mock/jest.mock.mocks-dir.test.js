test('Node.js built-in is not mocked witout manual jest.mock() call', () => {
  const obj = require('cluster')
  expect(Object.hasOwn(obj, 'foo')).toBe(false)
  expect(obj.foo).toBeUndefined()
  for (const key of ['isWorker', 'Worker', 'fork']) {
    expect(obj[key]).not.toBeUndefined()
    expect(Object.hasOwn(obj, key)).toBe(true)
  }
})

test('Node.js built-in mock', () => {
  jest.mock('cluster')
  const obj = require('cluster') // jest doesn't understand node:cluster, we do
  expect(Object.hasOwn(obj, 'foo')).toBe(true)
  expect(obj.foo).toBe('bar')
  for (const key of ['isWorker', 'Worker', 'fork']) {
    expect(obj[key]).toBeUndefined()
    expect(Object.hasOwn(obj, key)).toBe(false)
  }
})

// On Jest, works only with require, not with import

test('node_modules module mock is mocked even without manual jest.mock() call', () => {
  // jest.mock('eslint') // this call is not needed in Jest, but is allowed
  const obj = require('eslint') // eslint-disable-line @exodus/import/no-extraneous-dependencies
  expect(obj.hello).toBe('I am a mock')
  expect(Object.keys(obj).length).toBe(1)
})

test('single-arg jest.mock() can be still called even when mock from __mocks__ was loaded', () => {
  jest.mock('eslint') // this call is not needed in Jest, but is allowed
  const obj = require('eslint') // eslint-disable-line @exodus/import/no-extraneous-dependencies
  expect(obj.hello).toBe('I am a mock')
  expect(Object.keys(obj).length).toBe(1)
})

// TODO

// On Jest, works only with require, not with import
test.skip('inexisting module mock', () => {
  // jest.mock('not-an-existing-module') // this call is not needed in Jest, but is allowed
  const obj = require('not-an-existing-module')
  expect(obj).toBe('I am also a mock, though no such module exists')
})
