test('inband 1', () => {
  expect(globalThis.inband1).toBe(undefined)
  expect(globalThis.inband2).toBe(undefined)
  globalThis.inband1 = 1
})

test('inband 1 test 2', () => {
  expect(true).toBe(true)
})