import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const describeMocks = !jest.exodus || jest.exodus.features.esmMocks ? describe : describe.skip

describeMocks('mocking a require module from esm', () => {
  jest.mock('c8', () => ({
    __esModule: true,
    default: { x: 20 },
    foo: 'mocked foo',
  }))

  const fs = require('c8')

  test('should do a mock', () => {
    expect(fs.__esModule).toBe(true)
    expect(fs.default.x).toBe(20)
    expect(fs.foo).toBe('mocked foo')
  })
})
