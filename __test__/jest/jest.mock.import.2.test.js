import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

jest.mock('node:fs', () => ({
  bar: { x: 40 },
  foo: 'mocked foo',
}))

const testNamedBuiltin = !jest.exodus || jest.exodus.features.esmNamedBuiltinMocks ? it : it.skip

testNamedBuiltin('should do a mock with import named', async () => {
  const fs = await import('node:fs')
  expect(fs.bar?.x).toBe(40)
  expect(fs.foo).toBe('mocked foo')
})

test('should do a mock with import default', async () => {
  const { default: fs } = await import('node:fs')
  expect(fs.bar?.x).toBe(40)
  expect(fs.foo).toBe('mocked foo')
  expect(fs.default?.bar?.x).toBe(40)
  expect(fs.default?.foo).toBe('mocked foo')
})

test('should do a mock with require', async () => {
  const fs = require('node:fs')
  expect(fs.bar?.x).toBe(40)
  expect(fs.foo).toBe('mocked foo')
})
