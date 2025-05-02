import test from '@exodus/test/tape'

// From https://www.npmjs.com/package/tape-promise
// We don't allow using promises that are not async functions though

// example function that returns a Promise
// it could also be an async function
function delay(time) {
  return new Promise(function (resolve) {
    setTimeout(function () {
      resolve()
    }, time)
  })
}

test.skip('ensure promises works', function (t) {
  return delay(100).then(function () {
    t.true(true)
  })
})

// NOTICE 'async'?
test('ensure async works', async function (t) {
  await delay(100)
  t.true(true)
  t.end() // not really necessary
})

test('ensure that regular test functions still work', function (t) {
  t.true(true)
  t.end()
})

const asyncFunction = async () => {
  throw new Error('this function rejects')
}

// QuickJS bug: https://github.com/quickjs-ng/quickjs/pull/1038#issuecomment-2846674893
const testReject = process.env.EXODUS_TEST_PLATFORM === 'quickjs' ? test.skip : test
testReject('reject and doesNotReject example', async (t) => {
  await t.rejects(asyncFunction)
  await t.rejects(asyncFunction())
  await t.doesNotReject(Promise.resolve())
})
