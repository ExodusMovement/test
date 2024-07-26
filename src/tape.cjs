let lib

const loadLib = async () => {
  if (!lib) lib = await import('./tape.js')
  return lib
}

/* eslint-disable unicorn/no-await-expression-member */
const test = async (...args) => (await loadLib()).test(...args)
test.skip = async (...args) => (await loadLib()).test.skip(...args)
test.only = async (...args) => (await loadLib()).test.only(...args)
test.test = test
/* eslint-enable unicorn/no-await-expression-member */

module.exports = test
