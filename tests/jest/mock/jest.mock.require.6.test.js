jest.setMock('c8', {
  __esModule: true,
  default: { baz: 'BAR' },
  foo: 'some other foo',
})

const c8 = require('c8') // eslint-disable-line @exodus/import/no-extraneous-dependencies

test('should do a mock', () => {
  expect(c8.__esModule).toBe(true)
  expect(c8.default.baz).toBe('BAR')
  expect(c8.foo).toBe('some other foo')
})
