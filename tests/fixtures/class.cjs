class X {
  value = 30
  foo() {
    return 'bar'
  }
}

X.prototype.bar = 10

module.exports = X
