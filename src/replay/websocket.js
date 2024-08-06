/* eslint-disable unicorn/prefer-add-event-listener */

import { serializeBody, deserializeBody, bodyMatches } from './utils.js'

const { setImmediate, setTimeout, clearTimeout } = globalThis
const EVENT_TYPES = new Set(['open', 'message', 'close', 'error'])
const METHODS = new Set(['send()', 'close()'])
const GETTERS = new Set(['binaryType', 'bufferedAmount', 'readyState', 'protocol'])
const SETTERS = new Set(['binaryType']) // must be a subset of getters, see usage
const USER_CALLED = new Set([
  ...METHODS,
  ...[...SETTERS].map((x) => `set ${x}`),
  ...[...GETTERS].map((x) => `get ${x}`),
])
const noUndef = (obj) => Object.fromEntries(Object.entries(obj).filter(([_, v]) => v !== undefined))

const throwLater = (error) => {
  // TODO: recheck method/timing, perhaps polyfill setImmediate on Hermes?
  const thrower = () => {
    throw error
  }

  return setImmediate ? setImmediate(thrower) : Promise.resolve().then(thrower)
}

function makeEvent(type, { data, ...rest } = {}) {
  const init = { ...rest }
  if (data !== undefined) init.data = deserializeBody(data)
  if (init.error) {
    const { message, ...errorRest } = init.error
    init.error = new Error(message)
    Object.assign(init.error, errorRest)
  }

  try {
    try {
      if (type === 'message') return new MessageEvent(type, init)
      // if (type === 'close') // CloseEvent is not a global
      // if (type === 'error') // ErrorEvent is not a global
    } catch {}

    const event = new Event(type)
    Object.assign(event, init)
    return event
  } catch {}

  return { type, ...init } // fallback
}

// events have to be in order, and Blobs need to be async resolved to be properly recorded
class EventQueue {
  #queue = []

  get size() {
    return this.#queue.length
  }

  enqueue(fn) {
    const ready = Promise.all(this.#queue) // cloned at this point
    const handle = async () => {
      await ready
      await fn()
      this.#queue.shift()
    }

    this.#queue.push(handle())
  }
}

const EventTargetClass =
  globalThis.EventTarget ||
  class EventTarget {
    #listeners = new Map()

    #getListeners(type) {
      if (!this.#listeners.has(type)) this.#listeners.set(type, [])
      return this.#listeners.get(type)
    }

    addEventListener(type, fn, ...r) {
      if (!type || !fn) throw new Error('The "type" and "listener" arguments must be specified')
      if (r.length > 0) throw new Error('Extra parameters to addEventListener are not supported')
      this.#getListeners(type).push(fn)
    }

    removeEventListener(type, fn, ...r) {
      if (!type || !fn) throw new Error('The "type" and "listener" arguments must be specified')
      if (r.length > 0) throw new Error('Extra parameters to removeEventListener are not supported')
      const listeners = this.#getListeners(type)
      const id = listeners.indexOf(fn)
      if (id >= 0) listeners.splice(id, 1) // TODO: recheck if we should remove just one
    }

    dispatchEvent(event) {
      for (const listener of this.#getListeners(event.type)) {
        try {
          listener.call(this, event)
        } catch (error) {
          throwLater(error)
        }
      }
    }
  }

class BaseWebSocket extends EventTargetClass {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  #methods
  constructor(_url, protocols, rest, methods) {
    super()
    if (rest.length > 0) throw new Error('Extra parameters to WebSocket are not supported')
    if (protocols !== undefined && !Array.isArray(protocols)) throw new Error('Invalid protocols')

    this.#methods = methods
    for (const type of EVENT_TYPES) {
      let current
      Object.defineProperty(this, `on${type}`, {
        get: () => current,
        set(value) {
          if (current) this.removeEventListener(type, current)
          current = value
          this.addEventListener(type, current)
        },
      })
    }

    for (const name of GETTERS) {
      Object.defineProperty(this, name, {
        enumerable: true,
        get: methods.makeGetter(name),
        set: SETTERS.has(name) ? methods.makeSetter(name) : undefined,
      })
    }
  }

  get extensions() {
    return ''
  }

  #sendQueue = new EventQueue()
  send(data, ...rest) {
    if (rest.length > 0) throw new Error('Extra parameters to WebSocket#send are not supported')
    const serialized = serializeBody(data) // might be a promise for Blobs

    // fast path, direct send() call
    const canBeSync = this.#sendQueue.size === 0 && typeof serialized?.then !== 'function'
    if (canBeSync) return this.#methods.sendSerialized(serialized, data)

    // Have to serialize in async way for Blobs, also need to delay sends if we are already have a queue
    this.#sendQueue.enqueue(async () => this.#methods.sendSerialized(await serialized, data))
  }
}

class RecordWebSocket extends BaseWebSocket {
  #ws
  #recording
  #start

  constructor(log, WebSocketImplementation, url, protocols, ...rest) {
    super(url, protocols, rest, {
      makeGetter: (name) => () => {
        const value = this.#ws[name]
        this.#log(`get ${name}`, { value })
        return value
      },
      makeSetter: (name) => (value) => {
        this.#log(`set ${name}`, { value })
        this.#ws[name] = value
      },
      sendSerialized: (data, original) => {
        this.#log('send()', { data })
        this.#ws.send(original)
      },
    })
    this.#start = Date.now()
    this.#ws = new WebSocketImplementation(url, protocols)
    this.#recording = { url: `${url}`, protocols, log: [] }
    log.push(this.#recording)
    if (this.#ws.url !== this.#recording.url) throw new Error('Unexpected url mismatch')
    const eventQueue = new EventQueue()
    for (const type of EVENT_TYPES) {
      this.#ws[`on${type}`] = (event, ...rest) => {
        if (rest.length > 0) throw new Error('Unexpected rest args')
        eventQueue.enqueue(async () => {
          const data = await this.#logEvent(type, event)
          this.dispatchEvent(makeEvent(type, data))
        })
      }
    }
  }

  close(code, reason) {
    this.#log('close()', { code, reason })
    this.#ws.close(code, reason)
  }

  get url() {
    if (this.#ws.url !== this.#recording.url) throw new Error('Unexpected url mismatch')
    return this.#recording.url
  }

  #log(type, data) {
    this.#recording.log.push({ type, at: Date.now() - this.#start, ...noUndef(data) })
  }

  async #logEvent(type, event) {
    const serialized = await this.#serializeEvent(type, event)
    this.#log(type, serialized)
    return serialized
  }

  async #serializeEvent(type, event) {
    if (!EVENT_TYPES.has(type) || type !== event.type) throw new Error('Unexpected event type')
    const { origin, code, reason, wasClean, defaultPrevented, cancelable } = event
    if (cancelable || defaultPrevented) throw new Error('Unexpected cancelable / defaultPrevented')
    const data = await serializeBody(event.data)
    if (type === 'error') {
      const { message, code, errno } = event.error
      return { data, origin, code, reason, wasClean, error: { message, code, errno } }
    }

    if (event.error) throw new Error('Unexpected error')
    return { data, origin, code, reason, wasClean }
  }
}

class ReplayWebSocket extends BaseWebSocket {
  #recording
  #timeout
  #interval

  constructor(log, interval, url, protocols, ...rest) {
    super(url, protocols, rest, {
      makeGetter: (name) => () => {
        const { value } = this.#head
        this.#expect(`get ${name}`, { value })
        return value
      },
      makeSetter: (name) => (value) => this.#expect(`set ${name}`, { value }),
      sendSerialized: (data) => this.#expect('send()', { data }),
    })
    const tokey = (x) => JSON.stringify(x)
    const id = log.findIndex((x) => x.url === `${url}` && tokey(protocols) === tokey(x.protocols))
    if (id < 0) throw new Error(`Request to ${url} not found, ${log.length} more entries left`)
    this.#interval = interval
    this.#recording = log.splice(id, 1)[0]
    this.#nextTick(0)
  }

  get #head() {
    if (this.#recording.log.length === 0) throw new Error('No more entries in this session log')
    return this.#recording.log[0]
  }

  #nextTick(baseAt = 0) {
    clearTimeout(this.#timeout)
    if (this.#recording.log.length === 0 || USER_CALLED.has(this.#head.type)) return
    this.#timeout = setTimeout(() => this.#tick(), Math.min(this.#head.at - baseAt, this.#interval))
  }

  #tick() {
    clearTimeout(this.#timeout)
    if (this.#recording.log.length === 0 || USER_CALLED.has(this.#head.type)) return
    const { type, at, ...data } = this.#head
    if (!EVENT_TYPES.has(type)) throw new Error('Unexpected event type in log')
    this.#recording.log.shift()
    this.#nextTick(at)
    this.dispatchEvent(makeEvent(type, data))
  }

  #expect(type, rawData, defaults = {}, rest = []) {
    if (rest.length > 0) throw new Error(`Extra parameters to WebSocket#${type} are not supported`)
    const { type: actualType, at, ...rawExpected } = this.#head
    if (type !== actualType) throw new Error(`Unexpected WebSocket#${type} out of order`)
    const data = { ...defaults, ...noUndef(rawData) }
    const exp = { ...defaults, ...rawExpected } // already no undef
    for (const k of new Set([...Object.keys(data), ...Object.keys(exp)])) {
      if (!Object.hasOwn(data, k)) throw new Error(`Unexpected WebSocket#${type} with missing ${k}`)
      if (!Object.hasOwn(exp, k)) throw new Error(`Unexpected WebSocket#${type} with extra ${k}`)
      const ok = k === 'data' ? bodyMatches(data[k], exp[k]) : data[k] === exp[k]
      if (!ok) throw new Error(`Unexpected WebSocket#${type} with mismatching ${k}`)
    }

    this.#recording.log.shift()
    this.#nextTick(at)
  }

  close(code, reason, ...rest) {
    this.#expect('close()', { code, reason }, { code: 1000, reason: '' }, rest)
  }

  get url() {
    return this.#recording.url
  }
}

export function WebSocketRecorder(log, { WebSocket: _WebSocket = globalThis.WebSocket } = {}) {
  if (!Array.isArray(log)) throw new Error('log should be passed')
  if (!_WebSocket) throw new Error('No WebSocket implementation passed, no global WebSocket exists')
  return class WebSocket extends RecordWebSocket {
    constructor(...args) {
      super(log, _WebSocket, ...args) // log is not cloned as it's the output, we append to it
    }
  }
}

export function WebSocketReplayer(log, { interval = 0 } = {}) {
  if (!Array.isArray(log)) throw new Error('log should be passed')
  return class WebSocket extends ReplayWebSocket {
    constructor(...args) {
      super([...log], interval, ...args) // log is cloned as we mutate it
    }
  }
}
