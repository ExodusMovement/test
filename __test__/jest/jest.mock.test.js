jest.mock('node:fs', () => ({
  __esModule: true,
  default: { x: 20 },
  foo: 'mocked foo',
}))

const fs = await import('node:fs')

test('should do a mock', () => {
  expect(fs.__esModule).toBe(true)
  expect(fs.default.x).toBe(20)
  expect(fs.foo).toBe('mocked foo')
})
