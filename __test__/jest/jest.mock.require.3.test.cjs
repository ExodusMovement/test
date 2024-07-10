const fs = require('fs')

jest.mock('fs', () => ({
  __esModule: true,
  default: { what: 'HI' },
  maybe: 'because',
}))

test('should do a mock', () => {
  expect(fs.__esModule).toBe(true)
  expect(fs.default.what).toBe('HI')
  expect(fs.maybe).toBe('because')
})
