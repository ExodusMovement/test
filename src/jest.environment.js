import { getTestNamePath } from './dark.cjs'

export const specialEnvironments = {
  __proto__: null,

  jsdom: (require) => {
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
      const name = getTestNamePath(t).join('/')
      pollyGlobals.pollyContext.polly = new Polly(name, pollyGlobals.pollyContext.options)
    })

    jestGlobals.afterEach(async () => {
      if (!pollyGlobals.pollyContext.polly) return
      await pollyGlobals.pollyContext.polly.stop()
      pollyGlobals.pollyContext.polly = null
    })
  },
}
