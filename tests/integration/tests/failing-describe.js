/* eslint-disable no-unreachable */

describe('this should fail', () => {
  test('first', () => {})
  throw new Error('failed')
  test('second', () => {})
})
