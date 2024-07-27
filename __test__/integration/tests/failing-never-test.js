jest.setTimeout(100) // speed up things

describe('this should fail due to timeout', () => {
  test('first', async () => {
    expect(true).toBe(true)
    await new Promise(() => {})
  })
})
