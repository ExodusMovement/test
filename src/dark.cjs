const { fileURLToPath } = require('node:url')

let locForNextTest

let installLocationInNextTest = function (loc) {
  locForNextTest = loc
}

// WARNING
// Do not refactor, do not wrap
// This function has to be called unwrapped directly inside our test() impl
let getCallerLocation = () => {}

const mayBeUrlToPath = (str) => (str.startsWith('file://') ? fileURLToPath(str) : str)

// This is unoptimal
// Ideally, an option for overriding file locations should be added to Node.js,
// instead of relying on the call location of the original test() impl
// That could be even hardened by a simple option of how many frames up to look

// This whole logic is limited only to updating caller locations for reports
// We don't do use exposed Node.js internas for anything else

try {
  const { Test } = require('node:internal/test_runner/test')
  const locStorage = new Map()
  Object.defineProperty(Test.prototype, 'loc', {
    get() {
      return locStorage.get(this)
    },
    set(val) {
      locStorage.set(this, val)
      if (locForNextTest) {
        const loc = locForNextTest
        locForNextTest = undefined
        locStorage.set(this, { line: loc[0], column: loc[1], file: mayBeUrlToPath(loc[2]) })
      }
    },
  })

  // We can replicate getCallerLocation() with public V8 Error CallSite API, but we won't
  // need it anyway if we don't have a path for hook into internal Test implementation

  const { internalBinding } = require('node:internal/test/binding')
  getCallerLocation = internalBinding('util').getCallerLocation
} catch {}

module.exports = { installLocationInNextTest, getCallerLocation }
