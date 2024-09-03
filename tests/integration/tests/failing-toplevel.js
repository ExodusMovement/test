/* eslint-disable no-unreachable */

describe('this should pass', () => {
  test('first', () => {
    expect(true).toBe(true)
  })
})

throw new Error('errored')

describe('this should fail', () => {
  test('second', () => {
    expect(false).toBe(true)
  })
})
