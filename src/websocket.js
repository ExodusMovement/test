/* eslint-disable unicorn/prefer-add-event-listener */

import { readRecording, writeRecording } from './fetch.js'

let log, WebSocketImplementation

const recordingResolver = (dir, name) => [dir, '__recordings__', 'websocket', `${name}.json`]

const BINARY_TYPES = new Set(['blob', 'arraybuffer', 'nodebuffer'])

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

  #log(type, allData) {
    const data = Object.fromEntries(Object.entries(allData).filter(([_, v]) => v !== undefined))
    this.#recording.log.push({ type, at: Date.now() - this.#start, ...data })
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

export function webSocketRecord(options = {}) {
  if (log) throw new Error('Can not replay: already recording or replaying!')
  if (!writeRecording) throw new Error('Writing WebSocket log is not supported on this engine')
  log = []
  WebSocketImplementation = options.WebSocket || WebSocketImplementation || globalThis.WebSocket
  process.on('exit', () => writeRecording(recordingResolver, log))
  globalThis.WebSocket = class WebSocket extends RecordWebSocket {}
}

export function webSocketReplay() {
  if (log) throw new Error('Can not replay: already recording or replaying!')
  log = readRecording(recordingResolver) // Re-initialized from start on each call
  throw new Error('Unimplemented')
}
