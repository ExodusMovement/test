export const specialEnvironments = {
  __proto__: null,

  jsdom: {
    dependencies: ['jsdom'],
    setup: (require) => {
      const { JSDOM, VirtualConsole } = require('jsdom')
      const virtualConsole = new VirtualConsole()
      const { window } = new JSDOM('<!DOCTYPE html>', {
        url: 'http://localhost/',
        pretendToBeVisual: true,
        runScripts: 'dangerously',
        virtualConsole,
      })
      virtualConsole.sendTo(console, { omitJSDOMErrors: true })
      virtualConsole.on('jsdomError', (error) => {
        throw error
      })
      const assignMissing = (target, source) => {
        const entries = Object.entries(source).filter(([key]) => !Object.hasOwn(target, key))
        Object.assign(target, Object.fromEntries(entries))
      }

      assignMissing(globalThis, window)
      assignMissing(console, window.console)
      Object.setPrototypeOf(global, Object.getPrototypeOf(window))
    },
  },

  // Reproduces setup-polly-jest/jest-environment-node ad hacks into 'setup-polly-jest'.pollyJest
  'setup-polly-jest/jest-environment-node': {
    dependencies: ['@pollyjs/core', 'setup-polly-jest', 'setup-polly-jest/lib/common'],
    setup: async (require, engine) => {
      const { getTestNamePath } = await import('./dark.cjs')
      const { Polly } = require('@pollyjs/core')
      const pollyJest = require('setup-polly-jest')
      const {
        JestPollyGlobals,
        createPollyContextAccessor,
      } = require('setup-polly-jest/lib/common')
      const pollyGlobals = new JestPollyGlobals(globalThis)
      pollyGlobals.isJestPollyEnvironment = true
      pollyJest.setupPolly = (options) => {
        if (!pollyGlobals.isJestPollyEnvironment) return

        engine.before(() => {
          pollyGlobals.isPollyActive = true
          pollyGlobals.pollyContext.options = options
        })

        engine.after(() => {
          pollyGlobals.isPollyActive = false
          pollyGlobals.pollyContext.options = null
        })

        return createPollyContextAccessor(pollyGlobals)
      }

      engine.beforeEach((t) => {
        if (!pollyGlobals.isPollyActive) return
        const name = getTestNamePath(t).join('/')
        pollyGlobals.pollyContext.polly = new Polly(name, pollyGlobals.pollyContext.options)
      })

      engine.afterEach(async () => {
        if (!pollyGlobals.pollyContext.polly) return
        await pollyGlobals.pollyContext.polly.stop()
        pollyGlobals.pollyContext.polly = null
      })
    },
  },
}
