test('imports .cjs file', () => {
  expect(global.SETUP_CJS).toBe('setup.cjs')
})

test('imports .mjs file', () => {
  expect(global.SETUP_MJS).toBe('setup.mjs')
})

test('imports .js (module)', () => {
  expect(global.SETUP_JS_MODULE).toBe('setup.js')
})