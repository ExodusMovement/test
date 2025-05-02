// A slimmed-down version of globals.cjs specifically for Node.js bundle
Object.assign(process, { argv: process.argv })

if (!globalThis.crypto) {
  // Old Node.js, we polyfill it as our bundler polyfills crypto module using webcrypto RNG
  const r = require // prevent embed
  globalThis.crypto = r('node:crypto').webcrypto
}
