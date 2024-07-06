// Taken from https://jestjs.io/docs/mock-functions
// We store .calls as .callsArguments

function forEach(items, callback) {
  for (const item of items) {
    callback(item)
  }
}

const mockCallback = jest.fn((x) => 42 + x)

test('forEach mock function', () => {
  forEach([0, 1], mockCallback)

  // The mock function was called twice
  expect(mockCallback.mock.callsArguments).toHaveLength(2)

  // The first argument of the first call to the function was 0
  expect(mockCallback.mock.callsArguments[0][0]).toBe(0)

  // The first argument of the second call to the function was 1
  expect(mockCallback.mock.callsArguments[1][0]).toBe(1)

  // The return value of the first call to the function was 42
  expect(mockCallback.mock.results[0].value).toBe(42)
})
