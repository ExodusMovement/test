// Shoult not import src/ stuff here, as this goes into runner too (to check config)

function getTestNamePath(t, { require } = {}) {
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

export const specialEnvironments = {
  __proto__: null,

  // Reproduces setup-polly-jest/jest-environment-node ad hacks into 'setup-polly-jest'.pollyJest
  'setup-polly-jest/jest-environment-node': (require, jestGlobals) => {
    const { Polly } = require('@pollyjs/core')
    const pollyJest = require('setup-polly-jest')
    const { JestPollyGlobals, createPollyContextAccessor } = require('setup-polly-jest/lib/common')
    const pollyGlobals = new JestPollyGlobals(globalThis)
    pollyGlobals.isJestPollyEnvironment = true
    pollyJest.setupPolly = (options) => {
      if (!pollyGlobals.isJestPollyEnvironment) return

      jestGlobals.beforeAll(() => {
        pollyGlobals.isPollyActive = true
        pollyGlobals.pollyContext.options = options
      })

      jestGlobals.afterAll(() => {
        pollyGlobals.isPollyActive = false
        pollyGlobals.pollyContext.options = null
      })

      return createPollyContextAccessor(pollyGlobals)
    }

    jestGlobals.beforeEach((t) => {
      if (!pollyGlobals.isPollyActive) return
      const name = getTestNamePath(t, { require }).join('/')
      pollyGlobals.pollyContext.polly = new Polly(name, pollyGlobals.pollyContext.options)
    })

    jestGlobals.afterEach(async () => {
      if (!pollyGlobals.pollyContext.polly) return
      await pollyGlobals.pollyContext.polly.stop()
      pollyGlobals.pollyContext.polly = null
    })
  },
}
