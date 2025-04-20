import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const have = !jest.exodus || (jest.exodus.features.esmMocks && jest.exodus.features.dynamicRequire)
const describeMocks = have ? describe : describe.skip

describeMocks('mocking a require module from esm', () => {
  jest.mock('c8', () => ({
    __esModule: true,
    default: { x: 20 },
    foo: 'mocked foo',
  }))

  const fs = require('c8') // eslint-disable-line @exodus/import/no-extraneous-dependencies

  test('should do a mock', () => {
    expect(fs.__esModule).toBe(true)
    expect(fs.default.x).toBe(20)
    expect(fs.foo).toBe('mocked foo')
  })
})
