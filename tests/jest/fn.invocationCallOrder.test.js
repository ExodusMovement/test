test('mock.invocationCallOrder', () => {
  const fn1 = jest.fn()
  const fn2 = jest.fn()

  expect(fn1.mock.invocationCallOrder).toEqual([])
  expect(fn2.mock.invocationCallOrder).toEqual([])

  fn1()
  fn2()
  fn1()

  expect(fn1.mock.invocationCallOrder).toEqual([1, 3])
  expect(fn2.mock.invocationCallOrder).toEqual([2])
})
