// jest is actually failing on this, we follow node:test in pure impl
test('calls are not counted prior to finish', () => {
  const f = jest.fn(() => f.mock.calls.length)
  expect(f()).toBe(0)
  expect(f(2)).toBe(1)
  expect(f()).toBe(2)
  expect(f.mock.calls.length).toBe(3)
  expect(f.mock.calls).toEqual([[], [2], []])
})
