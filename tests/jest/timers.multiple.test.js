test('enabling timers when already enabled does not crash', () => {
  expect(() => jest.useFakeTimers()).not.toThrow()
  expect(() => jest.useFakeTimers()).not.toThrow()
  expect(() => jest.useFakeTimers()).not.toThrow()
})
