// Should not be an arrow function as might be used as a constructor
module.exports = function () {
  throw new Error('module unsupported in bundled mode')
}
