/* eslint-disable unicorn/prefer-add-event-listener */

import { readRecording, writeRecording } from './fetch.js'

let log, WebSocketImplementation, replayInterval

const { setImmediate, setTimeout, clearTimeout } = globalThis
const BINARY_TYPES = new Set(['blob', 'arraybuffer', 'nodebuffer'])
const EVENT_TYPES = new Set(['open', 'message', 'close', 'error'])
const USER_CALLED = new Set([
  'send()',
  'close()',
  'set binaryType',
  'get bufferedAmount',
  'get readyState',
  'get protocol',
])
const recordingResolver = (dir, name) => [dir, '__recordings__', 'websocket', `${name}.json`]
const noUndef = (obj) => Object.fromEntries(Object.entries(obj).filter(([_, v]) => v !== undefined))

const throwLater = (error) => {
  // TODO: recheck method/timing, perhaps polyfill setImmediate on Hermes?
  const thrower = () => {
    throw error
  }

  return setImmediate ? setImmediate(thrower) : Promise.resolve().then(thrower)
}

function makeEvent(type, data) {
  try {
    try {
      if (type === 'message') return new MessageEvent(type, data)
      // if (type === 'close') // CloseEvent is not a global
      // if (type === 'error') // ErrorEvent is not a global
    } catch {}

    const event = new Event(type)
    Object.assign(event, data)
    return event
  } catch {}

  return { type, ...data } // fallback
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
  #binaryType

  constructor(url, protocols, ...rest) {
    super(url, protocols, ...rest)
    this.#start = Date.now()
    this.#ws = new WebSocketImplementation(url, protocols)
    this.#binaryType = this.#ws.binaryType
    if (!BINARY_TYPES.has(this.#binaryType)) throw new Error('Unexpected binaryType')
    this.#recording = { url: `${url}`, protocols, binaryType: this.#binaryType, log: [] }
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
    if (this.#binaryType !== this.#ws.binaryType) throw new Error('Unexpected binaryType mismatch')
    return this.#ws.binaryType
  }

  set binaryType(value) {
    if (!BINARY_TYPES.has(value)) throw new Error('Unexpected set binaryType value')
    this.#log('set binaryType', { value })
    this.#ws.binaryType = this.#binaryType = value
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

  #serializeEvent(expectedType, event) {
    const { type, data, origin, code, reason, wasClean, defaultPrevented, cancelable } = event
    if (!EVENT_TYPES.has(type) || expectedType !== type) throw new Error('Unexpected event type')
    if (cancelable || defaultPrevented) throw new Error('Unexpected cancelable / defaultPrevented')
    if (type === 'error') {
      console.log(event, event.error)
      throw new Error('Recording errors is not supported yet')
    }

    if (data !== undefined && typeof data !== 'string') throw new Error('Unsupported data type')
    return { data, origin, code, reason, wasClean }
  }
}

class ReplayWebSocket extends BaseWebSocket {
  #recording
  #binaryType
  #timeout

  constructor(url, protocols, ...rest) {
    super(url, protocols, ...rest)
    const tokey = (x) => JSON.stringify(x)
    const id = log.findIndex((x) => x.url === `${url}` && tokey(protocols) === tokey(x.protocols))
    if (id < 0) throw new Error(`Request to ${url} not found, ${log.length} more entries left`)
    this.#recording = log.splice(id, 1)[0]
    this.#binaryType = this.#recording.binaryType || BINARY_TYPES[0]
    this.#nextTick(0)
  }

  get #head() {
    if (this.#recording.log.length === 0) throw new Error('No more entries in this session log')
    return this.#recording.log[0]
  }

  #nextTick(baseAt = 0) {
    clearTimeout(this.#timeout)
    if (this.#recording.log.length === 0 || USER_CALLED.has(this.#head.type)) return
    this.#timeout = setTimeout(() => this.#tick(), Math.min(this.#head.at - baseAt, replayInterval))
  }

  #tick() {
    clearTimeout(this.#timeout)
    if (this.#recording.log.length === 0 || USER_CALLED.has(this.#head.type)) return
    const { type, at, ...data } = this.#head
    if (!EVENT_TYPES.has(type)) throw new Error('Unexpected event type in log')
    if (type === 'error') throw new Error('Replaying errors is not supported yet')
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
    return this.#binaryType
  }

  set binaryType(value) {
    if (!BINARY_TYPES.has(value)) throw new Error('Unexpected set binaryType value')
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

export function websocketRecord(options = {}) {
  if (log) throw new Error('Can not replay: already recording or replaying!')
  if (!writeRecording) throw new Error('Writing WebSocket log is not supported on this engine')
  log = []
  WebSocketImplementation = options.WebSocket || WebSocketImplementation || globalThis.WebSocket
  process.on('exit', () => writeRecording(recordingResolver, log))
  const WebSocket = class WebSocket extends RecordWebSocket {}
  globalThis.WebSocket = WebSocket
  return WebSocket
}

export function websocketReplay({ interval = 0 } = {}) {
  if (log) throw new Error('Can not replay: already recording or replaying!')
  log = readRecording(recordingResolver) // Re-initialized from start on each call
  replayInterval = interval
  const WebSocket = class WebSocket extends ReplayWebSocket {}
  globalThis.WebSocket = WebSocket
  return WebSocket
}
