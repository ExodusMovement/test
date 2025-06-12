jest.doMock('c8', () => {})

const c8 = require('c8') // eslint-disable-line @exodus/import/no-extraneous-dependencies

test('should do a mock with undefined value', () => {
  expect(c8).toBe(undefined)
})
