test('no Node.js clear{Timeout|Interval|Immediate} timer bug', () => {
  expect(() => jest.useFakeTimers()).not.toThrow()
  expect(() => clearTimeout()).not.toThrow()
  expect(() => clearInterval()).not.toThrow()
  expect(() => clearImmediate()).not.toThrow()
})
