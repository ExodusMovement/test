if (!globalThis.global) globalThis.global = globalThis
if (!globalThis.Buffer) globalThis.Buffer = require('buffer').Buffer
if (!globalThis.console) {
  // eslint-disable-next-line no-undef
  globalThis.console = { log: print, error: print, warn: print, info: print, debug: print }
}

if (!Array.prototype.at) {
  // eslint-disable-next-line no-extend-native
  Array.prototype.at = function (i) {
    return this[i < 0 ? this.length + i : i]
  }
}

if (globalThis.describe) delete globalThis.describe
