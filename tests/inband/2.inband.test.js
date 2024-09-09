test('inband 2', () => {
  expect(globalThis.inband1).toBe(1)
  expect(globalThis.inband2).toBe(undefined)
  globalThis.inband2 = 2
})
