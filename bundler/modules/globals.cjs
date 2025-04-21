// We expect bundler to optimize out EXODUS_TEST_PLATFORM blocks
/* eslint-disable sonarjs/no-collapsible-if, unicorn/no-lonely-if */

if (!globalThis.global) globalThis.global = globalThis
if (!globalThis.Buffer) globalThis.Buffer = require('buffer').Buffer

const consoleKeys = ['log', 'error', 'warn', 'info', 'debug', 'trace']
const { print } = globalThis
if (!globalThis.console) globalThis.console = Object.fromEntries(consoleKeys.map((k) => [k, print])) // eslint-disable-line no-undef

// In browsers e.g. errors (and some other objects) are hard to unwrap via the API
// So we just stringify everything instead on the sender side
// In barebone, we don't want console.log({x:10}) to print "[Object object]"", we want "{ x: 10 }"
if (process.env.EXODUS_TEST_IS_BROWSER || process.env.EXODUS_TEST_IS_BAREBONE) {
  const utilFormat = require('exodus-test:util-format')
  if (print) globalThis.print = (...args) => print(utilFormat(...args))
  for (const type of consoleKeys) {
    if (!Object.hasOwn(console, type)) continue
    const orig = console[type].bind(console)
    console[type] = (...args) => orig(utilFormat(...args))
  }
}

if (!console.time || !console.timeEnd) {
  const start = new Map()
  const now = globalThis.performance?.now ? performance.now.bind(performance) : Date.now.bind(Date) // d8 and jsc have performance.now()
  const warn = (text) => console.error(`Warning: ${text}`)
  console.time = (key = 'default') => {
    if (start.has(key)) return warn(`Label '${key}' already exists for console.time()`) // Does not reset
    start.set(key, now()) // Start late
  }

  console.timeEnd = (key = 'default') => {
    const ms = now() // End early
    if (!start.has(key)) return warn(`No such label '${key}' for console.timeEnd()`)
    console.log(`${key}: ${ms - start.get(key)}ms`)
    start.delete(key)
  }
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
  const at = function (i) {
    return this[i < 0 ? this.length + i : i]
  }

  // eslint-disable-next-line no-extend-native
  Object.defineProperty(Array.prototype, 'at', { configurable: true, writable: true, value: at })
}

if (process.env.EXODUS_TEST_PLATFORM === 'hermes') {
  // Fixed after 0.12, not present in 0.12
  // Refs: https://github.com/facebook/hermes/commit/e8fa81328dd630e39975e6d16ac3e6f47f4cba06
  if (!Promise.allSettled) {
    const wrap = (element) =>
      Promise.resolve(element).then(
        (value) => ({ status: 'fulfilled', value }),
        (reason) => ({ status: 'rejected', reason })
      )
    Promise.allSettled = (iterable) => Promise.all([...iterable].map((element) => wrap(element)))
  }

  // Refs: https://github.com/facebook/hermes/commit/e97db61b49bd0c065a3ce7da46f074bc39b80c6a
  if (!Promise.any) {
    const AggregateError =
      globalThis.AggregateError ||
      class AggregateError extends Error {
        constructor(errors, message) {
          super(message)
          this.name = 'AggregateError'
          this.errors = errors
        }
      }

    const errmsg = 'All promises were rejected'
    Promise.any = function (values) {
      const promises = [...values]
      const errors = []
      if (promises.length === 0) return Promise.reject(new AggregateError(errors, errmsg))
      let resolved = false
      return new Promise((resolve, reject) => {
        const oneResolve = (value) => {
          if (resolved) return
          resolved = true
          errors.length = 0
          resolve(value)
        }

        const oneReject = (error) => {
          if (resolved) return
          errors.push(error)
          if (errors.length === promises.length) reject(new AggregateError(errors, errmsg))
        }

        promises.forEach((promise) => Promise.resolve(promise).then(oneResolve, oneReject))
      })
    }
  }
}

if (globalThis.describe) delete globalThis.describe

if (typeof process === 'undefined') {
  // Fixes process.exitCode handling

  const process = {
    __proto__: null,
    _exitCode: 0,
    set exitCode(value) {
      process._exitCode = value
      if (globalThis.process) globalThis.process.exitCode = value
      if (globalThis.Deno) globalThis.Deno.exitCode = value
    },
    get exitCode() {
      return process._exitCode
    },
    exit: (code = 0) => {
      globalThis.Deno?.exit?.(code)
      globalThis.process?.exit?.(code)
      process.exitCode = code
      process._maybeProcessExitCode()
    },
    _exitHook: null,
    _maybeProcessExitCode: () => {
      if (globalThis.Deno) return // has native exitCode support
      if (process._exitHook) return process._exitHook(process._exitCode)
      if (process._exitCode !== 0) {
        setTimeout(() => {
          const err = new Error('Test failed')
          err.stack = ''
          throw err
        }, 0)
      }
    },
    cwd: () => {
      // eslint-disable-next-line no-undef
      if (typeof EXODUS_TEST_PROCESS_CWD === 'string') return EXODUS_TEST_PROCESS_CWD
      throw new Error('Can not determine cwd, no process available')
    },
  }

  globalThis.EXODUS_TEST_PROCESS = process
}

if (process.env.EXODUS_TEST_PLATFORM === 'hermes') {
  const print = console.log.bind(console) // we don not want overrides
  let headerLogged = false
  globalThis.HermesInternal?.enablePromiseRejectionTracker({
    allRejections: true,
    onUnhandled: (i, err) => {
      globalThis.EXODUS_TEST_PROCESS.exitCode = 1
      if (!headerLogged) {
        print(`‼ FATAL Tests generated asynchronous activity after they ended.
This activity created errors and would have caused tests to fail, but instead triggered unhandledRejection events`)
        headerLogged = true
      }

      print(`Uncaught error #${i}: ${err}`)
      globalThis.EXODUS_TEST_PROCESS._maybeProcessExitCode()
    },
  })
}

if (
  process.env.EXODUS_TEST_PLATFORM === 'hermes' ||
  (process.env.EXODUS_TEST_IS_BAREBONE && !globalThis.clearTimeout)
) {
  // Ok, we have broken timers, let's hack them around
  let i = 0
  const timers = new Map()
  const repeating = new Set()
  const { setTimeout: setTimeoutOriginal, clearTimeout: clearTimeoutOriginal } = globalThis
  const dateNow = Date.now.bind(Date)
  const precision = clearTimeoutOriginal ? Infinity : 10 // have to tick this fast for clearTimeout to work

  const setTimeout = (fn, time, ...args) => {
    const id = `ht${i++}`
    let started = dateNow()
    const tick = () => {
      if (!timers.has(id)) return
      const remaining = started + time - dateNow()
      if (remaining < 0) {
        if (repeating.has(id)) {
          started = dateNow()
          timers.set(id, setTimeoutOriginal(tick, Math.min(precision, time)))
        } else {
          timers.delete(id)
        }

        fn(...args)
      } else {
        timers.set(id, setTimeoutOriginal(tick, Math.min(precision, remaining)))
      }
    }

    timers.set(id, setTimeoutOriginal(tick, Math.min(precision, time)))
    return id
  }

  globalThis.setTimeout = setTimeout
  globalThis.setInterval = (fn, time, ...args) => {
    const id = setTimeout(fn, time, ...args)
    repeating.add(id)
    return id
  }

  globalThis.clearTimeout = globalThis.clearInterval = (id) => {
    if (!timers.has(id)) return
    clearTimeoutOriginal?.(timers.get(id))
    timers.delete(id)
    repeating.delete(id)
  }
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
      return typedArray
    }

    throw new Error(`Not enough csprng entropy in this test bundle (ref: @exodus/test)`)
  }
}

delete globalThis.EXODUS_TEST_CRYPTO_ENTROPY

if (globalThis.crypto?.getRandomValues && !globalThis.crypto?.randomUUID) {
  const getRandomValues = globalThis.crypto.getRandomValues.bind(globalThis.crypto)
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

if (!globalThis.crypto.subtle) globalThis.crypto.subtle = {} // For getRandomValues detection

if (process.env.EXODUS_TEST_IS_BAREBONE) {
  if (!globalThis.URLSearchParams) globalThis.URLSearchParams = require('@ungap/url-search-params')
  if (!globalThis.TextEncoder || !globalThis.TextDecoder) {
    const { TextEncoder, TextDecoder } = require('exodus-test:text-encoding-utf')
    if (!globalThis.TextEncoder) globalThis.TextEncoder = TextEncoder
    if (!globalThis.TextDecoder) global.TextDecoder = TextDecoder
  }
}
