import assert from 'node:assert/strict'

// from strip-color, patched for unicode just in case
// eslint-disable-next-line no-control-regex
const stripColor = (str) => str.replace(/\x1B[[(?);]{0,2}(;?\d)*./gu, '')

test('methods are overridable', () => {
  const f = jest.fn(() => 1)
  expect(f()).toBe(1)
  expect(f()).toBe(1)
  f.mockImplementation = () => {}
  f.mockImplementation(() => 2)
  expect(f()).toBe(1)
  expect(f()).toBe(1)
})

test('mockReset resets to undefined', () => {
  const f = jest.fn(() => 1)
  expect(f()).toBe(1)
  expect(f()).toBe(1)
  f.mockImplementation(() => 2)
  expect(f()).toBe(2)
  expect(f()).toBe(2)
  f.mockReset()
  expect(f()).toBe(undefined)
  expect(f()).toBe(undefined)
})

test('mockRestore with no spyOn is mockReset', () => {
  const f = jest.fn(() => 1)
  expect(f()).toBe(1)
  expect(f()).toBe(1)
  f.mockImplementation(() => 2)
  expect(f()).toBe(2)
  expect(f()).toBe(2)
  f.mockRestore()
  expect(f()).toBe(undefined)
  expect(f()).toBe(undefined)
})

test('mockRestore with spyOn', () => {
  const obj = { x: () => 2 }
  const fn = jest.spyOn(obj, 'x')
  fn.mockImplementation(() => 3)
  expect(obj.x()).toBe(3)
  expect(fn()).toBe(3)
  expect(obj.x).toBe(fn)
  fn.mockRestore()
  expect(obj.x()).toBe(2)
  expect(fn()).toBe(undefined)
  expect(obj.x).not.toBe(fn)
})

// https://jestjs.io/docs/mock-function-api#mockfnmockcalls
test('mockFn.mock.calls', () => {
  const f = jest.fn()
  f('arg1', 'arg2')
  f('arg3', 'arg4')
  expect(f.mock.calls).toEqual([
    ['arg1', 'arg2'],
    ['arg3', 'arg4'],
  ])
})

// https://jestjs.io/docs/mock-function-api#mockfnmockresults
test('mockFn.mock.results', () => {
  const f = jest.fn((callable) => callable())

  f(() => 'result1')

  try {
    f(() => {
      throw new Error('my error')
    })
  } catch {}

  f(() => 'result2')

  expect(f.mock.results).toEqual([
    { type: 'return', value: 'result1' },
    { type: 'throw', value: new Error('my error') },
    { type: 'return', value: 'result2' },
  ])
})

// https://jestjs.io/docs/mock-function-api#mockfnmockinstances
test('mockFn.mock.instances', () => {
  const MockFn = jest.fn()
  const a = new MockFn()
  const b = new MockFn()
  expect(MockFn.mock.instances[0]).toBe(a)
  expect(MockFn.mock.instances[1]).toBe(b)

  // added
  expect(MockFn.mock.instances[0]).not.toBe(b)
  expect(MockFn.mock.instances[1]).not.toBe(a)
})

// https://jestjs.io/docs/mock-function-api#mockfnmockcontexts
test('mockFn.mock.contexts', () => {
  const mockFn = jest.fn()

  const thisContext0 = {}
  const thisContext1 = {}
  const thisContext2 = {}

  const boundMockFn = mockFn.bind(thisContext0)
  boundMockFn('a', 'b')
  mockFn.call(thisContext1, 'a', 'b')
  mockFn.apply(thisContext2, ['a', 'b'])

  expect(mockFn.mock.contexts[0]).toBe(thisContext0)
  expect(mockFn.mock.contexts[1]).toBe(thisContext1)
  expect(mockFn.mock.contexts[2]).toBe(thisContext2)

  // added
  expect(mockFn.mock.contexts[0]).not.toBe(thisContext1)
  expect(mockFn.mock.contexts[0]).not.toBe(thisContext2)
  expect(mockFn.mock.contexts[1]).not.toBe(thisContext0)
  expect(mockFn.mock.contexts[1]).not.toBe(thisContext2)
  expect(mockFn.mock.contexts[2]).not.toBe(thisContext0)
  expect(mockFn.mock.contexts[2]).not.toBe(thisContext1)
})

// https://jestjs.io/docs/mock-function-api#mockfnmocklastcall
test('mockFn.mock.lastCall', () => {
  const f = jest.fn()
  f('arg1', 'arg2')
  f('arg3', 'arg4')
  expect(f.mock.lastCall).toEqual(['arg3', 'arg4'])
})

// https://jestjs.io/docs/mock-function-api#mockfnmockclear
test('mockClear', () => {
  const f = jest.fn()
  f('arg1', 'arg2')
  f('arg3', 'arg4')
  f.mockClear()
  expect(f.mock.calls).toEqual([])
  expect(f.mock.lastCall).toEqual(undefined)
})

// https://jestjs.io/docs/mock-function-api#mockfnmockimplementationfn
test('mockImplementation', () => {
  const mockFn = jest.fn((scalar) => 42 + scalar)

  expect(mockFn(0)).toBe(42)
  expect(mockFn(1)).toBe(43)

  mockFn.mockImplementation((scalar) => 36 + scalar)

  expect(mockFn(2)).toBe(38)
  expect(mockFn(3)).toBe(39)
})

// https://jestjs.io/docs/mock-function-api#mockfnmockimplementationoncefn
test('mockImplementationOnce', () => {
  const mockFn = jest
    .fn(() => 'default')
    .mockImplementationOnce(() => 'first call')
    .mockImplementationOnce(() => 'second call')

  expect(mockFn()).toBe('first call')
  expect(mockFn()).toBe('second call')
  expect(mockFn()).toBe('default')
  expect(mockFn()).toBe('default')
})

// https://jestjs.io/docs/mock-function-api#mockfnmocknamename
test('mockName / getMockName', () => {
  assert.throws(
    () => {
      const mockFn = jest.fn().mockName('mockedFunction')
      expect(mockFn).toHaveBeenCalled()
    },
    (err) => {
      assert.equal(
        stripColor(err.message),
        `
expect(mockedFunction).toHaveBeenCalled()

Expected number of calls: >= 1
Received number of calls:    0
`.trim()
      )
      return true
    }
  )
})

// https://jestjs.io/docs/mock-function-api#mockfnmockreturnvaluevalue
test('mockReturnValue', () => {
  const mock = jest.fn()

  mock.mockReturnValue(42)
  expect(mock()).toBe(42)

  mock.mockReturnValue(43)
  expect(mock()).toBe(43)
})

// https://jestjs.io/docs/mock-function-api#mockfnmockreturnvalueoncevalue
test('mockReturnValueOnce', () => {
  const mockFn = jest
    .fn()
    .mockReturnValue('default')
    .mockReturnValueOnce('first call')
    .mockReturnValueOnce('second call')

  expect(mockFn()).toBe('first call')
  expect(mockFn()).toBe('second call')
  expect(mockFn()).toBe('default')
  expect(mockFn()).toBe('default')
})

// https://jestjs.io/docs/mock-function-api#mockfnmockresolvedvaluevalue
test('mockResolvedValue', async () => {
  const asyncMock = jest.fn().mockResolvedValue(43)

  await expect(asyncMock()).resolves.toBe(43)
})

// https://jestjs.io/docs/mock-function-api#mockfnmockresolvedvalueoncevalue
test('mockResolvedValueOnce', async () => {
  const asyncMock = jest
    .fn()
    .mockResolvedValue('default')
    .mockResolvedValueOnce('first call')
    .mockResolvedValueOnce('second call')

  await expect(asyncMock()).resolves.toBe('first call')
  await expect(asyncMock()).resolves.toBe('second call')
  await expect(asyncMock()).resolves.toBe('default')
  await expect(asyncMock()).resolves.toBe('default')
})

// https://jestjs.io/docs/mock-function-api#mockfnmockrejectedvaluevalue
test('mockRejectedValue', async () => {
  const asyncMock = jest.fn().mockRejectedValue(new Error('Async error message'))

  await expect(asyncMock()).rejects.toThrow('Async error message')
})

// https://jestjs.io/docs/mock-function-api#mockfnmockrejectedvalueoncevalue
test('mockResolvedValueOnce', async () => {
  const asyncMock = jest
    .fn()
    .mockResolvedValueOnce('first call')
    .mockRejectedValueOnce(new Error('Async error message'))

  await expect(asyncMock()).resolves.toBe('first call')
  await expect(asyncMock()).rejects.toThrow('Async error message')
})
