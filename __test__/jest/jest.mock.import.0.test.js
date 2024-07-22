jest.mock('node:fs', () => ({
  __esModule: true,
  default: { x: 20 },
  foo: 'mocked foo',
}))

const testNamedBuiltin = !jest.exodus || jest.exodus.features.esmNamedBuiltinMocks ? it : it.skip

testNamedBuiltin('should do a mock', async () => {
  const fs = await import('node:fs')
  expect(fs.__esModule).toBe(true)
  expect(fs.default.x).toBe(20)
  expect(fs.foo).toBe('mocked foo')
})
