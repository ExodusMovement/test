class One {
  common = 'base'
  one = 1
  why() {
    return 'ok'
  }

  overridden() {
    return 'no'
  }
}

class Two extends One {
  common = 'high'
  two = 2
  hi() {
    return 'hello'
  }

  overridden() {
    return 'yes'
  }
}

module.exports = new Two()
