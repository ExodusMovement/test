const { fileURLToPath } = require('node:url')

const mayBeUrlToPath = (str) => (str.startsWith('file://') ? fileURLToPath(str) : str)

let locForNextTest

const installLocationInNextTest = function (loc) {
  locForNextTest = loc
}

// WARNING
// Do not refactor, do not wrap
// This function has to be called unwrapped directly inside our test() impl
let getCallerLocation

// This is unoptimal
// Ideally, an option for overriding file locations should be added to Node.js,
// instead of relying on the call location of the original test() impl
// That could be even hardened by a simple option of how many frames up to look

// This whole logic is limited only to updating caller locations for reports
// We don't do use exposed Node.js internas for anything else

function createCallerLocationHook() {
  if (getCallerLocation) return { installLocationInNextTest, getCallerLocation }

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
  } catch {
    getCallerLocation = () => {}
  }

  return { installLocationInNextTest, getCallerLocation }
}

// Easy on Node.js >= 22.3.0, but we polyfill for the rest
function getTestNamePath(t) {
  // No implementation in Node.js yet, will have to PR
  if (t.fullName) return t.fullName.split(' > ')

  // We are on Node.js < 22.3.0 where even t.fullName doesn't exist yet, polyfill
  const namePath = Symbol('namePath')
  const getNamePath = Symbol('getNamePath')
  try {
    if (t[namePath]) return t[namePath]

    // Sigh, ok, whatever
    const { Test } = require('node:internal/test_runner/test')

    const usePathName = Symbol('usePathName')
    const restoreName = Symbol('restoreName')
    Test.prototype[getNamePath] = function () {
      if (this === this.root) return []
      return [...(this.parent?.[getNamePath]() || []), this.name]
    }

    const diagnostic = Test.prototype.diagnostic
    Test.prototype.diagnostic = function (...args) {
      if (args[0] === usePathName) {
        this[restoreName] = this.name
        this.name = this[getNamePath]()
        return
      }

      if (args[0] === restoreName) {
        this.name = this[restoreName]
        delete this[restoreName]
        return
      }

      return diagnostic.apply(this, args)
    }

    const TestContextProto = Object.getPrototypeOf(t)
    Object.defineProperty(TestContextProto, namePath, {
      get() {
        this.diagnostic(usePathName)
        const result = this.name
        this.diagnostic(restoreName)
        return result
      },
    })

    return t[namePath]
  } catch {}

  return [t.name] // last resort
}

function makeEsbuildMockable() {
  const usingTsx = process.execArgv.some((x) => x.endsWith('node_modules/tsx/dist/loader.mjs'))
  if (!usingTsx) return
  // Hook into tsx/esbuild transpiled module conversion magic to make loaded modules mockable in runtime
  // We want all modules to be .configurable = true, so we can override them
  const defineProperty = Object.defineProperty
  const obj = Object.create(null)
  Object.defineProperty = (target, name, options) => {
    if (options.get && !options.configurable && name !== '__esModule') {
      if (target.__esModule) {
        // eslint-disable-next-line @exodus/mutable/no-param-reassign-prop-only
        options.configurable = true
      } else {
        const stackTraceLimit = Error.stackTraceLimit
        Error.stackTraceLimit = 2
        Error.captureStackTrace(obj, Object.defineProperty)
        Error.stackTraceLimit = stackTraceLimit
        // This is for speed, we don't want to work with text
        const prepareStackTrace = Error.prepareStackTrace
        Error.prepareStackTrace = (e, callsites) => callsites.map((site) => site.getFunctionName())
        const st = obj.stack
        Error.prepareStackTrace = prepareStackTrace
        if (st[0] === '__export' && st[1] === null) {
          // eslint-disable-next-line @exodus/mutable/no-param-reassign-prop-only
          options.configurable = true
        }
      }
    }

    return defineProperty(target, name, options)
  }
}

module.exports = { createCallerLocationHook, getTestNamePath, makeEsbuildMockable }
