export const specialEnvironments = {
  __proto__: null,

  jsdom: {
    dependencies: ['jsdom'],
    setup: (require) => {
      const { JSDOM, VirtualConsole } = require('jsdom')
      const virtualConsole = new VirtualConsole()
      const dom = new JSDOM('<!DOCTYPE html>', {
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
        const descriptors = Object.getOwnPropertyDescriptors(source)
        const entries = Object.entries(descriptors).filter(([key]) => !Object.hasOwn(target, key))
        Object.defineProperties(target, Object.fromEntries(entries))
      }

      assignMissing(globalThis, dom.window)
      assignMissing(console, dom.window.console)
      Object.setPrototypeOf(globalThis, Object.getPrototypeOf(dom.window))
      try {
        assignMissing(globalThis, dom.getInternalVMContext())
      } catch {}
    },
  },
}
