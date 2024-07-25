if (!globalThis.global) globalThis.global = globalThis
if (!globalThis.Buffer) globalThis.Buffer = require('buffer').Buffer
if (!globalThis.console) {
  // eslint-disable-next-line no-undef
  globalThis.console = { log: print, error: print, warn: print, info: print, debug: print }
}

if (!globalThis.fetch) {
  globalThis.fetch = () => {
    throw new Error('Fetch not supported')
  }
}

if (!globalThis.WebSocket) {
  globalThis.WebSocket = () => {
    throw new Error('WebSocket not supported')
  }
}

if (!Array.prototype.at) {
  // eslint-disable-next-line no-extend-native
  Array.prototype.at = function (i) {
    return this[i < 0 ? this.length + i : i]
  }
}

if (globalThis.describe) delete globalThis.describe

if (process.env.EXODUS_TEST_PLATFORM === 'hermes') {
  // Ok, we have broken timers, let's hack them around
  let i = 0
  const timers = new Map()
  const { setTimeout, clearTimeout } = globalThis
  const dateNow = Date.now
  globalThis.setTimeout = (fn, time) => {
    const id = `ht${i++}`
    const now = dateNow()
    const tick = () => {
      if (!timers.has(id)) return
      const remaining = now + time - dateNow()
      if (remaining < 0) {
        timers.delete(id)
        fn()
      } else {
        timers.set(id, setTimeout(tick, remaining))
      }
    }

    timers.set(id, setTimeout(tick, time))
  }

  globalThis.clearTimeout = (id) => {
    if (!timers.has(id)) return
    clearTimeout(timers.get(id))
    timers.delete(id)
  }
  // TODO: setInterval, clearInterval
}
