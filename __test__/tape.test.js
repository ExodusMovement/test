import test from '../src/tape.js'

const myThing = 5

test('this is a child test', (t) => {
  t.plan(3)
  t.pass('this passes')
  t.ok(myThing, 'this passes if truthy')
  t.equal(myThing, 5, 'this passes if the values are equal')
  t.end()
})
