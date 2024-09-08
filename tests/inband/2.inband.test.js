test('inband 2', () => {
  expect(process.env.EXODUS_TEST_INBAND).toBeTruthy()
  expect(globalThis.inband1).toBe(1)
  expect(globalThis.inband2).toBe(undefined)
  globalThis.inband1 = 2
})
