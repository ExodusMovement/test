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

if (typeof process === 'undefined') {
  // Fixes process.exitCode handling

  const process = {
    __proto__: null,
    _exitCode: 0,
    // eslint-disable-next-line accessor-pairs
    set exitCode(value) {
      process._exitCode = value
      if (globalThis.process) globalThis.process.exitCode = value
      if (globalThis.Deno) globalThis.Deno.exitCode = value
    },
    exit: (code = 0) => {
      globalThis.Deno?.exit?.(code)
      globalThis.process?.exit?.(code)
      process.exitCode = code
      process._maybeProcessExitCode()
    },
    _maybeProcessExitCode: () => {
      if (globalThis.Deno) return // has native exitCode support
      if (process._exitCode !== 0) {
        setTimeout(() => {
          throw new Error('Test failed')
        }, 0)
      }
    },
  }

  globalThis.EXODUS_TEST_PROCESS = process
}

if (
  process.env.EXODUS_TEST_PLATFORM === 'hermes' ||
  (process.env.EXODUS_TEST_PLATFORM === 'jsc' && !globalThis.clearTimeout)
) {
  // Ok, we have broken timers, let's hack them around
  let i = 0
  const timers = new Map()
  const { setTimeout, clearTimeout } = globalThis
  const dateNow = Date.now
  const precision = clearTimeout ? Infinity : 10 // have to tick this fast for clearTimeout to work

  globalThis.setTimeout = (fn, time, ...args) => {
    const id = `ht${i++}`
    const now = dateNow()
    const tick = () => {
      if (!timers.has(id)) return
      const remaining = now + time - dateNow()
      if (remaining < 0) {
        timers.delete(id)
        fn(...args)
      } else {
        timers.set(id, setTimeout(tick, Math.min(precision, remaining)))
      }
    }

    timers.set(id, setTimeout(tick, Math.min(precision, time)))
    return id
  }

  globalThis.clearTimeout = (id) => {
    if (!timers.has(id)) return
    clearTimeout?.(timers.get(id))
    timers.delete(id)
  }
  // TODO: setInterval, clearInterval
}

if (!globalThis.crypto?.getRandomValues && globalThis.EXODUS_TEST_CRYPTO_ENTROPY) {
  const entropy = Buffer.from(globalThis.EXODUS_TEST_CRYPTO_ENTROPY, 'base64')
  let pos = 0
  if (!globalThis.crypto) globalThis.crypto = {}
  const TypedArray = Object.getPrototypeOf(Uint8Array)
  globalThis.crypto.getRandomValues = (typedArray) => {
    if (!(typedArray instanceof TypedArray)) throw new Error('Argument should be a TypedArray')
    const view = Buffer.from(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength)
    if (pos + view.length <= entropy.length) {
      pos += view.length
      const copied = entropy.copy(view, 0, pos - view.length)
      if (copied !== view.length) throw new Error('Unexpected')
      return // ok
    }

    throw new Error(`Not enough csprng entropy in this test bundle (ref: @exodus/test)`)
  }
}

delete globalThis.EXODUS_TEST_CRYPTO_ENTROPY

if (globalThis.crypto?.getRandomValues && !globalThis.crypto?.randomUUID) {
  const { getRandomValues } = globalThis.crypto
  let entropy

  const hex = (start, end) => entropy.slice(start, end).toString('hex')

  globalThis.crypto.randomUUID = () => {
    if (!entropy) entropy = Buffer.alloc(16)

    getRandomValues(entropy)
    entropy[6] = (entropy[6] & 0x0f) | 0x40 // version 4: 0100xxxx
    entropy[8] = (entropy[8] & 0x3f) | 0x80 // variant 1: 10xxxxxx

    // xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    return `${hex(0, 4)}-${hex(4, 6)}-${hex(6, 8)}-${hex(8, 10)}-${hex(10, 16)}`
  }
}

if (process.env.EXODUS_TEST_PLATFORM === 'hermes' || process.env.EXODUS_TEST_PLATFORM === 'jsc') {
  if (!globalThis.URLSearchParams) globalThis.URLSearchParams = require('@ungap/url-search-params')
  if (!globalThis.TextEncoder || !globalThis.TextDecoder) {
    const { TextEncoder, TextDecoder } = require('text-encoding')
    if (!globalThis.TextEncoder) globalThis.TextEncoder = TextEncoder
    if (!globalThis.TextDecoder) global.TextDecoder = TextDecoder
  }
}
