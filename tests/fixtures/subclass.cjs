class A {
  something = 'anything'
  base() {
    return 'bar'
  }
}
A.prototype.over = 'never'
A.prototype.value = 'basic'

class B extends A {
  space = 'world'
  sub() {
    return 'hello'
  }
}
B.prototype.value = 'extended'

module.exports = B
