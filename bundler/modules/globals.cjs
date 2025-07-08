// We expect bundler to optimize out EXODUS_TEST_PLATFORM blocks
/* eslint-disable sonarjs/no-collapsible-if, unicorn/no-lonely-if */

if (!globalThis.global) globalThis.global = globalThis
if (!globalThis.Buffer) globalThis.Buffer = require('buffer').Buffer

const consoleKeys = ['log', 'error', 'warn', 'info', 'debug', 'trace']
const { print } = globalThis
if (process.env.EXODUS_TEST_PLATFORM === 'engine262') delete globalThis.console // prints [object Object] on everything
if (!globalThis.console) globalThis.console = Object.fromEntries(consoleKeys.map((k) => [k, print])) // eslint-disable-line no-undef
for (const k of consoleKeys) if (!console[k]) console[k] = console.log // SpiderMonkey has console but no console.error

// In browsers e.g. errors (and some other objects) are hard to unwrap via the API
// So we just stringify everything instead on the sender side
// In barebone, we don't want console.log({x:10}) to print "[Object object]"", we want "{ x: 10 }"
if (process.env.EXODUS_TEST_IS_BROWSER || process.env.EXODUS_TEST_IS_BAREBONE) {
  const utilFormat = require('exodus-test:util-format')
  if (print) globalThis.print = (...args) => print(utilFormat(...args))
  for (const type of consoleKeys) {
    if (!Object.hasOwn(console, type)) continue
    const orig = console[type].bind(console)
    console[type] = (...args) => {
      try {
        orig(utilFormat(...args))
      } catch {
        orig(...args) // fallback if format fails
      }
    }
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

if (process.env.EXODUS_TEST_PLATFORM === 'quickjs' && globalThis.os) {
  const { setTimeout, setInterval, clearTimeout, clearInterval } = globalThis.os
  Object.assign(globalThis, { setTimeout, setInterval, clearTimeout, clearInterval })
  for (const key of ['os', 'std', 'bjson']) delete globalThis[key]
}

if (globalThis.describe) delete globalThis.describe

if (
  process.env.EXODUS_TEST_PLATFORM === 'hermes' ||
  (process.env.EXODUS_TEST_IS_BAREBONE && !globalThis.clearTimeout)
) {
  // Ok, we have broken timers, let's hack them around
  const { setTimeout: setTimeoutOriginal, clearTimeout: clearTimeoutOriginal } = globalThis
  const tickTimes = async (n) => {
    if (process.env.EXODUS_TEST_PLATFORM === 'escargot') {
      // escargot is _special_ (slow on await, unless we drain manually)
      let promise = Promise.resolve()
      for (let i = 0; i < n; i++) promise = promise.then(() => {})
      globalThis.drainJobQueue()
      await promise
    } else {
      const promise = Promise.resolve() // tickTimes(0) is equivalent to one Promise.resolve() as it's async
      for (let i = 0; i < n; i++) await promise
    }
  }

  // TODO: use interrupt timers on jsc

  const tickPromiseInterval = process.env.EXODUS_TEST_PLATFORM === 'engine262' ? 5 : 50 // engine262 is slow
  const schedule = setTimeoutOriginal || ((x) => tickTimes(tickPromiseInterval).then(() => x())) // e.g. SpiderMonkey doesn't even have setTimeout
  const dateNow = Date.now.bind(Date)
  const precision = clearTimeoutOriginal ? Infinity : 10 // have to tick this fast for clearTimeout to work
  let current = 0
  let loopTimeout
  let publicId = 0
  const timerMap = new Map()
  let queue = []
  const stopLoop = () => {
    clearTimeoutOriginal?.(loopTimeout)
    current++
  }

  const restartLoop = () => {
    if (loopTimeout !== undefined) clearTimeoutOriginal?.(loopTimeout) // hermes clearTimeout doesn't follow spec on undefined
    const at = queue[0].runAt
    const id = ++current
    const tick = () => {
      if (id !== current) return
      const remaining = at - dateNow()
      if (remaining <= 0) return queueTick()
      loopTimeout = schedule(tick, Math.min(precision, remaining))
    }

    loopTimeout = schedule(tick, Math.min(precision, at - dateNow()))
  }

  const queueSchedule = (entry) => {
    if (!entry.publicId) entry.publicId = ++publicId // eslint-disable-line @exodus/mutable/no-param-reassign-prop-only
    timerMap.set(entry.publicId, entry)

    const before = queue.findIndex((x) => x.runAt > entry.runAt)
    if (before === -1) {
      queue.push(entry)
    } else {
      queue.splice(before, 0, entry)
    }

    if (entry === queue[0]) restartLoop()
    return entry.publicId
  }

  const queueMicrotick = () => {
    if (queue.length === 0 || !(queue[0].runAt <= dateNow())) return null
    const next = queue.shift()
    if (next.interval === undefined) {
      timerMap.delete(next.publicId)
    } else {
      next.runAt += next.interval
      queueSchedule(next)
    }

    next.callback(...next.args)
  }

  const queueTick = () => {
    current++ // safeguard
    while (queueMicrotick() !== null);
    if (queue.length > 0) restartLoop()
  }

  globalThis.setTimeout = (callback, delay = 0, ...args) =>
    queueSchedule({ callback, runAt: delay + dateNow(), args })

  globalThis.setInterval = (callback, delay = 0, ...args) =>
    queueSchedule({ callback, runAt: delay + dateNow(), interval: delay, args })

  globalThis.clearTimeout = globalThis.clearInterval = (id) => {
    const entry = timerMap.get(id)
    if (!entry) return
    timerMap.delete(id)
    queue = queue.filter((x) => x !== entry)
    if (queue.length === 0) stopLoop()
  }
}

const { setTimeout } = globalThis // we need non-overriden by fake timers one

const isBarebone = process.env.EXODUS_TEST_IS_BAREBONE
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
          if (isBarebone) print('EXODUS_TEST_FAILED_EXIT_CODE_1')
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
} else {
  Object.assign(process, { argv: process.argv }) // apply values from defined bundled vars, if present
}

if (process.env.EXODUS_TEST_PLATFORM === 'hermes' || process.env.EXODUS_TEST_IS_BROWSER) {
  const print = console.log.bind(console) // we don not want overrides
  let logHeader = () => {
    globalThis.EXODUS_TEST_PROCESS.exitCode = 1
    print(`‼ FATAL Tests generated asynchronous activity after they ended.
This activity created errors and would have caused tests to fail, but instead triggered unhandledRejection events`)
    logHeader = () => {}
    setTimeout(() => globalThis.EXODUS_TEST_PROCESS._maybeProcessExitCode(), 0)
  }

  if (process.env.EXODUS_TEST_PLATFORM === 'hermes') {
    const onUnhandled = (i, err) => {
      logHeader()
      print(`Uncaught error #${i}: ${err}`)
    }

    globalThis.HermesInternal?.enablePromiseRejectionTracker({ allRejections: true, onUnhandled })
  } else if (process.env.EXODUS_TEST_IS_BROWSER) {
    // Won't catch all errors, as we might still be running, but better than nothing
    // We also don't print anything except the header, as browsers already print that
    // Cancelling the default behavior is less robust as we want to treat this as error
    globalThis.addEventListener('unhandledrejection', () => logHeader())
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
