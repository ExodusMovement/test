/* eslint-disable unicorn/prefer-add-event-listener */

import { readRecording, writeRecording } from './fetch.js'

let log, WebSocketImplementation, replayInterval

const { setTimeout, clearTimeout } = globalThis
const BINARY_TYPES = new Set(['blob', 'arraybuffer', 'nodebuffer'])
const recordingResolver = (dir, name) => [dir, '__recordings__', 'websocket', `${name}.json`]
const noUndef = (obj) => Object.fromEntries(Object.entries(obj).filter(([_, v]) => v !== undefined))

class RecordWebSocket {
  onopen
  onmessage
  onclose
  onerror

  #ws
  #recording
  #start
  #binaryType

  constructor(url, ...rest) {
    if (rest.length > 0) throw new Error('Extra parameters to WebSocket are not supported')
    this.#start = Date.now()
    this.#ws = new WebSocketImplementation(url)
    this.#binaryType = this.#ws.binaryType
    if (!BINARY_TYPES.has(this.#binaryType)) throw new Error('Unexpected binaryType')
    this.#recording = { url: `${url}`, binaryType: this.#binaryType, log: [] }
    log.push(this.#recording)
    if (this.#ws.url !== this.#recording.url) throw new Error('Unexpected url mismatch')
    this.#ws.onopen = (event, ...rest) => {
      if (rest.length > 0) throw new Error('Unexpected rest args')
      this.#logEvent('open', event)
      if (this.onopen) this.onopen(event)
    }

    this.#ws.onmessage = (event, ...rest) => {
      if (rest.length > 0) throw new Error('Unexpected rest args')
      this.#logEvent('message', event)
      if (this.onmessage) this.onmessage(event)
    }

    this.#ws.onclose = (event, ...rest) => {
      if (rest.length > 0) throw new Error('Unexpected rest args')
      this.#logEvent('close', event)
      if (this.onclose) this.onclose(event)
    }

    this.#ws.onerror = (error, ...rest) => {
      if (rest.length > 0) throw new Error('Unexpected rest args')
      this.#log('error', { error: this.#serializeError(error) })
      if (this.onerror) this.onerror(error)
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

  addEventListener() {
    throw new Error('addEventListener() is not supported yet')
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
    throw new Error('bufferedAmount support is not implemented yet')
  }

  get extensions() {
    throw new Error('extensions support is not implemented yet')
  }

  get protocol() {
    throw new Error('protocol support is not implemented yet')
  }

  get readyState() {
    throw new Error('readyState support is not implemented yet')
  }

  get url() {
    if (this.#ws.url !== this.#recording.url) throw new Error('Unexpected url mismatch')
    return this.#recording.url
  }

  #log(type, data) {
    this.#recording.log.push({ type, at: Date.now() - this.#start, ...noUndef(data) })
  }

  #logEvent(type, event) {
    this.#log(type, this.#serializeEvent(type, event))
  }

  #serializeEvent(expectedType, event) {
    const { type, data, origin, code, reason, wasClean, defaultPrevented, cancelable } = event
    if (expectedType !== type) throw new Error('Unexpected event type')
    if (cancelable || defaultPrevented) throw new Error('Unexpected cancelable / defaultPrevented')
    if (data !== undefined && typeof data !== 'string') throw new Error('Unsupported data type')
    return { data, origin, code, reason, wasClean }
  }

  #serializeError(error) {
    console.log(error)
    throw new Error('Recording errors is not supported yet')
  }
}

class ReplayWebSocket {
  onopen
  onmessage
  onclose
  onerror

  #recording
  #binaryType
  #timeout

  constructor(url, ...rest) {
    if (rest.length > 0) throw new Error('Extra parameters to WebSocket are not supported')
    const id = log.findIndex((x) => x.url === `${url}`)
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
    if (this.#recording.log.length === 0) return
    if (['send()', 'close()', 'set binaryType'].includes(this.#head.type)) return
    this.#timeout = setTimeout(() => this.#tick(), Math.min(this.#head.at - baseAt, replayInterval))
  }

  #tick() {
    clearTimeout(this.#timeout)
    if (this.#recording.log.length === 0) return
    if (['send()', 'close()', 'set binaryType'].includes(this.#head.type)) return
    const { type, at, ...data } = this.#head
    switch (type) {
      case 'open':
      case 'message':
      case 'close':
        break
      case 'error':
        throw new Error('Replaying errors is not supported yet')
      default:
        throw new Error('Unexpected event type in log')
    }

    this.#recording.log.shift()
    this.#nextTick(at)
    const method = `on${type}`
    if (this[method]) this[method]({ type, ...data }) // TODO: proper events
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

  addEventListener() {
    throw new Error('addEventListener() is not supported yet')
  }

  get binaryType() {
    return this.#binaryType
  }

  set binaryType(value) {
    if (!BINARY_TYPES.has(value)) throw new Error('Unexpected set binaryType value')
    this.#expect('set binaryType', { value })
  }

  get bufferedAmount() {
    throw new Error('bufferedAmount support is not implemented yet')
  }

  get extensions() {
    throw new Error('extensions support is not implemented yet')
  }

  get protocol() {
    throw new Error('protocol support is not implemented yet')
  }

  get readyState() {
    throw new Error('readyState support is not implemented yet')
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
