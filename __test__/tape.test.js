import test from '@exodus/test/tape'

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
  setTimeout(() => t.ok(Date.now() - start >= 45), 50)
  t.equal(1, 1)
})

const someAsyncThing = (x, t) => new Promise((resolve) => setTimeout(() => resolve(x * 2), t))

test('test using promises', async function (t) {
  const result = await someAsyncThing(21, 50)
  t.equal(result, 42)
})

test('plan in the middle', (t) => {
  t.equal(2 + 2, 4)
  t.plan(3)
  t.equal(3 + 2, 5)
  t.equal(3 - 2, 1)
})
