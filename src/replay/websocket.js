/* eslint-disable unicorn/prefer-add-event-listener */

const { setImmediate, setTimeout, clearTimeout } = globalThis
const EVENT_TYPES = new Set(['open', 'message', 'close', 'error'])
const USER_CALLED = new Set([
  'send()',
  'close()',
  'set binaryType',
  'get binaryType',
  'get bufferedAmount',
  'get readyState',
  'get protocol',
])
const noUndef = (obj) => Object.fromEntries(Object.entries(obj).filter(([_, v]) => v !== undefined))

const throwLater = (error) => {
  // TODO: recheck method/timing, perhaps polyfill setImmediate on Hermes?
  const thrower = () => {
    throw error
  }

  return setImmediate ? setImmediate(thrower) : Promise.resolve().then(thrower)
}

function makeEvent(type, data) {
  const init = { ...data }
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

  constructor(_url, protocols, ...rest) {
    super()
    if (rest.length > 0) throw new Error('Extra parameters to WebSocket are not supported')
    if (protocols !== undefined && !Array.isArray(protocols)) throw new Error('Invalid protocols')

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
  }

  get extensions() {
    return ''
  }
}

class RecordWebSocket extends BaseWebSocket {
  #ws
  #recording
  #start

  constructor(log, WebSocketImplementation, url, protocols, ...rest) {
    super(url, protocols, ...rest)
    this.#start = Date.now()
    this.#ws = new WebSocketImplementation(url, protocols)
    this.#recording = { url: `${url}`, protocols, log: [] }
    log.push(this.#recording)
    if (this.#ws.url !== this.#recording.url) throw new Error('Unexpected url mismatch')
    for (const type of EVENT_TYPES) {
      this.#ws[`on${type}`] = (event, ...rest) => {
        if (rest.length > 0) throw new Error('Unexpected rest args')
        const data = this.#logEvent(type, event)
        this.dispatchEvent(makeEvent(type, data))
      }
    }
  }

  send(data, ...rest) {
    if (rest.length > 0) throw new Error('Extra parameters to WebSocket#send are not supported')
    if (data !== undefined && typeof data !== 'string') throw new Error('Unsupported data type')
    this.#log('send()', { data })
    this.#ws.send(data)
  }

  close(code, reason) {
    this.#log('close()', { code, reason })
    this.#ws.close(code, reason)
  }

  get binaryType() {
    const value = this.#ws.binaryType
    this.#log('get binaryType', { value })
    return value
  }

  set binaryType(value) {
    this.#log('set binaryType', { value })
    this.#ws.binaryType = value
  }

  get bufferedAmount() {
    const value = this.#ws.bufferedAmount
    this.#log('get bufferedAmount', { value })
    return value
  }

  get protocol() {
    const value = this.#ws.protocol
    this.#log('get protocol', { value })
    return value
  }

  get readyState() {
    const value = this.#ws.readyState
    this.#log('get readyState', { value })
    return value
  }

  get url() {
    if (this.#ws.url !== this.#recording.url) throw new Error('Unexpected url mismatch')
    return this.#recording.url
  }

  #log(type, data) {
    this.#recording.log.push({ type, at: Date.now() - this.#start, ...noUndef(data) })
  }

  #logEvent(type, event) {
    const serialized = this.#serializeEvent(type, event)
    this.#log(type, serialized)
    return serialized
  }

  #serializeEvent(type, event) {
    if (!EVENT_TYPES.has(type) || type !== event.type) throw new Error('Unexpected event type')
    const { data, origin, code, reason, wasClean, defaultPrevented, cancelable } = event
    if (cancelable || defaultPrevented) throw new Error('Unexpected cancelable / defaultPrevented')
    if (data !== undefined && typeof data !== 'string') throw new Error('Unsupported data type')
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
    super(url, protocols, ...rest)
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
      if (data[k] !== exp[k]) throw new Error(`Unexpected WebSocket#${type} with mismatching ${k}`)
    }

    this.#recording.log.shift()
    this.#nextTick(at)
  }

  send(data, ...rest) {
    if (data !== undefined && typeof data !== 'string') throw new Error('Unsupported data type')
    this.#expect('send()', { data }, {}, rest)
  }

  close(code, reason, ...rest) {
    this.#expect('close()', { code, reason }, { code: 1000, reason: '' }, rest)
  }

  get binaryType() {
    const { value } = this.#head
    this.#expect('get binaryType', { value })
    return value
  }

  set binaryType(value) {
    this.#expect('set binaryType', { value })
  }

  get bufferedAmount() {
    const { value } = this.#head
    this.#expect('get bufferedAmount', { value })
    return value
  }

  get protocol() {
    const { value } = this.#head
    this.#expect('get protocol', { value })
    return value
  }

  get readyState() {
    const { value } = this.#head
    this.#expect('get readyState', { value })
    return value
  }

  get url() {
    return this.#recording.url
  }
}

export function WebSocketRecorder(log, { WebSocket: realWebSocket = globalThis.WebSocket } = {}) {
  if (!Array.isArray(log)) throw new Error('log should be passed')
  return class WebSocket extends RecordWebSocket {
    constructor(...args) {
      super(log, realWebSocket, ...args) // log is not cloned as it's the output, we append to it
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
