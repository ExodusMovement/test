
import { tap } from '../src/index.js'

const myThing = 5

tap('this is a child test', t => {
  t.pass('this passes')
  t.ok(myThing, 'this passes if truthy')
  t.equal(myThing, 5, 'this passes if the values are equal')
  t.end()
})
