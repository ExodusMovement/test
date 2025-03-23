const describeModuleMocks = !jest.exodus || jest.exodus.features.esmMocks ? describe : describe.skip

describeModuleMocks('Mocking non-builtin module import from esm', () => {
  jest.mock('../../fixtures/esm.js', () => ({
    __esModule: true,
    default: { baz: 'BAR' },
    foo: 'some other foo',
  }))

  test('should do a mock', async () => {
    const c8 = await import('../../fixtures/esm.js')
    expect(c8.default.baz).toBe('BAR')
    expect(c8.foo).toBe('some other foo')
  })
})
