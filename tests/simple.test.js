describe('example test', () => {
  test('first test', () => {
    expect(1).toBe(1)
    expect(1).not.toBe(2)
  })

  test('failing test', () => {
    expect(1).toBe(2)
  })
})
