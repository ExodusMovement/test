// Taken from https://jestjs.io/docs/api

describe('test.each from docs', () => {
  test.each([
    [1, 1, 2],
    [1, 2, 3],
    [2, 1, 3],
  ])('.add(%i, %i)', (a, b, expected) => {
    expect(a + b).toBe(expected)
  })

  test.each([
    { a: 1, b: 1, expected: 2 },
    { a: 1, b: 2, expected: 3 },
    { a: 2, b: 1, expected: 3 },
  ])('.add($a, $b)', ({ a, b, expected }) => {
    expect(a + b).toBe(expected)
  })
})
