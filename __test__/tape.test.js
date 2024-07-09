import test from '../src/tape.js'

const myThing = 5

test('this is a child test', (t) => {
  t.plan(3)
  t.pass('this passes')
  t.ok(myThing, 'this passes if truthy')
  t.equal(myThing, 5, 'this passes if the values are equal')
  t.end()
})

test('test with an end', (t) => {
  t.pass('this is fine')
  t.end()
})

test('timing test', function (t) {
  t.plan(3)
  t.equal(typeof Date.now, 'function')
  var start = Date.now()
  setTimeout(() => t.ok(Date.now() - start >= 50), 50)
  t.equal(1, 1)
})

const someAsyncThing = (x, t) => new Promise((resolve) => setTimeout(() => resolve(x * 2), t))

test('test using promises', async function (t) {
  const result = await someAsyncThing(21, 50)
  t.equal(result, 42)
})
