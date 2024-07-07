import { when, resetAllWhenMocks, verifyAllWhenMocksCalled } from 'jest-when'

// https://www.npmjs.com/package/jest-when#basic-usage
test('basic usage', () => {
  const fn = jest.fn()

  when(fn).calledWith(1).mockReturnValue('yay!')

  expect(fn()).toEqual(undefined) // added
  expect(fn(1)).toEqual('yay!')
})

// https://www.npmjs.com/package/jest-when#supports-chaining-of-mock-trainings
describe('Supports chaining of mock trainings', () => {
  test('variant 1', () => {
    const fn = jest.fn()

    when(fn).calledWith(1).mockReturnValue('yay!').calledWith(2).mockReturnValue('nay!')

    expect(fn(1)).toEqual('yay!')
    expect(fn(2)).toEqual('nay!')
  })

  test('variant 2', () => {
    const fn = jest.fn()

    when(fn).calledWith(1).mockReturnValueOnce('yay!').mockReturnValue('nay!')

    expect(fn(1)).toEqual('yay!')
    expect(fn(1)).toEqual('nay!')
  })
})

// https://www.npmjs.com/package/jest-when#supports-replacement-of-mock-trainings
test('Supports replacement of mock trainings', () => {
  const fn = jest.fn()

  when(fn).calledWith(1).mockReturnValueOnce('yay!').mockReturnValue('nay!')

  expect(fn(1)).toEqual('yay!')
  expect(fn(1)).toEqual('nay!')
})

// https://www.npmjs.com/package/jest-when#supports-training-for-single-calls
test('Supports training for single calls', () => {
  const fn = jest.fn()

  when(fn).calledWith(1, true, 'foo').mockReturnValueOnce('yay!')
  when(fn).calledWith(1, true, 'foo').mockReturnValueOnce('nay!')

  expect(fn(1, true, 'foo')).toEqual('yay!')
  expect(fn(1, true, 'foo')).toEqual('nay!')
  expect(fn(1, true, 'foo')).toBeUndefined()
})

// https://www.npmjs.com/package/jest-when#supports-promises-both-resolved-and-rejected
test('Supports Promises, both resolved and rejected', async () => {
  const fn = jest.fn()

  when(fn).calledWith(1).mockResolvedValue('yay!')
  when(fn).calledWith(2).mockResolvedValueOnce('nay!')

  await expect(fn(1)).resolves.toEqual('yay!')
  await expect(fn(1)).resolves.toEqual('yay!')

  await expect(fn(2)).resolves.toEqual('nay!')
  expect(await fn(2)).toBeUndefined()

  when(fn).calledWith(3).mockRejectedValue(new Error('oh no!'))
  when(fn).calledWith(4).mockRejectedValueOnce(new Error('oh no, an error again!'))

  await expect(fn(3)).rejects.toThrow('oh no!')
  await expect(fn(3)).rejects.toThrow('oh no!')

  await expect(fn(4)).rejects.toThrow('oh no, an error again!')
  expect(await fn(4)).toBeUndefined()
})

// https://www.npmjs.com/package/jest-when#supports-jestspyon
test('Supports jest.spyOn', () => {
  const theInstance = { theMethod: () => 42 }

  const theSpiedMethod = jest.spyOn(theInstance, 'theMethod')
  when(theSpiedMethod).calledWith(1).mockReturnValue('mock')
  const returnValue = theInstance.theMethod(1)
  expect(returnValue).toBe('mock')
})

// https://www.npmjs.com/package/jest-when#supports-jest-asymmetric-matchers
// This also fails on jest with "You must provide an array to ArrayContaining, not 'boolean'."
// So we skip it, seems like an error in jest-when documentation
test.skip('Supports jest asymmetric matchers', () => {
  const fn = jest.fn()

  when(fn)
    .calledWith(expect.anything(), expect.any(Number), expect.arrayContaining(false))
    .mockReturnValue('yay!')

  const result = fn('whatever', 100, [true, false])
  expect(result).toEqual('yay!')
})

// https://www.npmjs.com/package/jest-when#supports-function-matchers
test('Supports function matchers', () => {
  const fn = jest.fn()

  const allValuesTrue = when((arg) => Object.values(arg).every(Boolean))
  const numberDivisibleBy3 = when((arg) => arg % 3 === 0)

  when(fn).calledWith(allValuesTrue, numberDivisibleBy3).mockReturnValue('yay!')

  expect(fn({ foo: true, bar: true }, 9)).toEqual('yay!')
  expect(fn({ foo: true, bar: false }, 9)).toEqual(undefined)
  expect(fn({ foo: true, bar: false }, 13)).toEqual(undefined)
})

// https://www.npmjs.com/package/jest-when#supports-compound-declarations
test('Supports compound declarations', () => {
  const fn = jest.fn()

  when(fn).calledWith(1).mockReturnValue('no')
  when(fn).calledWith(2).mockReturnValue('way?')
  when(fn).calledWith(3).mockReturnValue('yes')
  when(fn).calledWith(4).mockReturnValue('way!')

  expect(fn(1)).toEqual('no')
  expect(fn(2)).toEqual('way?')
  expect(fn(3)).toEqual('yes')
  expect(fn(4)).toEqual('way!')
  expect(fn(5)).toEqual(undefined)
})

// https://www.npmjs.com/package/jest-when#supports-matching-or-asserting-against-all-of-the-arguments-together-using-whenallargs
describe('Supports matching or asserting against all of the arguments together using when.allArgs', () => {
  test('E.g. All args should be numbers', () => {
    const fn = jest.fn()

    const areNumbers = (args, equals) => args.every((arg) => equals(arg, expect.any(Number)))
    when(fn).calledWith(when.allArgs(areNumbers)).mockReturnValue('yay!')

    expect(fn(3, 6, 9)).toEqual('yay!')
    expect(fn(3, 666)).toEqual('yay!')
    expect(fn(-100, 2, 3.234_234, 234, 90e3)).toEqual('yay!')
    expect(fn(123, 'not a number')).toBeUndefined()
  })

  // Fails on jest, so we skip
  test.skip('E.g. Single arg match', () => {
    const fn = jest.fn()

    const argAtIndex = (index, matcher) =>
      when.allArgs((args, equals) => equals(args[index], matcher))

    when(fn)
      .calledWith(argAtIndex(0, expect.any(Number)))
      .mockReturnValue('yay!')

    expect(fn(3, 6, 9)).toEqual('yay!')
    expect(fn(3, 666)).toEqual('yay!')
    expect(fn(-100, 2, 3.234_234, 234, 90e3)).toEqual('yay!')
    expect(fn(123, 'not a number')).toBeUndefined()
  })

  test('E.g. Partial match, only first defined matching args matter', () => {
    const fn = jest.fn()
    const partialArgs = (...argsToMatch) =>
      when.allArgs((args, equals) => equals(args, expect.arrayContaining(argsToMatch)))

    when(fn)
      .calledWith(partialArgs(1, 2, 3))
      .mockReturnValue('x')

    expect(fn(1, 2, 3)).toEqual('x')
    expect(fn(1, 2, 3, 4, 5, 6)).toEqual('x')
    expect(fn(1, 2)).toBeUndefined()
    expect(fn(1, 2, 4)).toBeUndefined()
  })
})

// https://www.npmjs.com/package/jest-when#assert-the-args
test('Assert the args', () => {
  const fn = jest.fn()

  when(fn).expectCalledWith(1).mockReturnValue('x')

  expect(() => {
    fn(2) // Will throw a helpful jest assertion error with args diff
  }).toThrow()
})

// https://www.npmjs.com/package/jest-when#supports-default-behavior
describe('Supports default behavior', () => {
  test('One', () => {
    const fn = jest.fn()

    when(fn).calledWith('foo').mockReturnValue('special').defaultReturnValue('default') // This line can be placed anywhere, doesn't have to be at the end

    expect(fn('foo')).toEqual('special')
    expect(fn('bar')).toEqual('default')
  })

  test('Two', () => {
    const fn = jest.fn()

    // Same as above example
    when(fn).mockReturnValue('default').calledWith('foo').mockReturnValue('special')

    expect(fn('foo')).toEqual('special')
    expect(fn('bar')).toEqual('default')
  })
})

// https://www.npmjs.com/package/jest-when#supports-custom-mockimplementation
test('Supports custom mockImplementation', () => {
  const fn = jest.fn()
  const cb = jest.fn()

  when(fn)
    .calledWith(cb)
    .mockImplementation((callbackArg) => callbackArg())

  fn(cb)

  expect(cb).toBeCalled()
})

// https://www.npmjs.com/package/jest-when#supports-reseting-mocks-between-tests
test('Supports reseting mocks between tests', () => {
  const fn = jest.fn()

  when(fn).expectCalledWith(1).mockReturnValueOnce('x')

  expect(fn(1)).toEqual('x')

  resetAllWhenMocks()

  when(fn).expectCalledWith(1).mockReturnValueOnce('z')

  expect(fn(1)).toEqual('z')
})

// https://www.npmjs.com/package/jest-when#supports-verifying-that-all-mocked-functions-were-called
describe('Supports verifying that all mocked functions were called', () => {
  test('One', () => {
    const fn = jest.fn()

    when(fn).expectCalledWith(1).mockReturnValueOnce('x')

    expect(fn(1)).toEqual('x')

    verifyAllWhenMocksCalled() // passes
  })

  test('Two', () => {
    const fn = jest.fn()

    when(fn).expectCalledWith(1).mockReturnValueOnce('x')

    expect(() => {
      verifyAllWhenMocksCalled() // fails
    }).toThrow()
  })
})
