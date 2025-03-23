// Main test file is tests/jest/snapshot.test.js
// This one just additionally rechecks named snapshot presence

it('supports named snapshots', async () => {
  expect({ name: 'Bruce Wayne' }).toMatchSnapshot('public knowledge')
  expect({ alterEgo: 'Batman', name: 'Bruce Wayne' }).toMatchSnapshot('not so public knowledge')
  expect({ name: 'Joker', address: 'Arkham Asylum' }).toMatchSnapshot('public knowledge')

  let createRequire
  try {
    ;({ createRequire } = await import('node:module'))
  } catch {
    // skip the rest of this test for environments without node:module
    return
  }

  const require = createRequire(import.meta.url)
  const snapshots = require('./__snapshots__/snapshot.test.js.snap')

  ;[
    'supports named snapshots: public knowledge 1',
    'supports named snapshots: public knowledge 2',
    'supports named snapshots: not so public knowledge 1',
  ].forEach((name) => {
    expect(Object.hasOwn(snapshots, name)).toBe(true)
  })
})
