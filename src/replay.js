import {
  fetchRecorder,
  fetchReplayer,
  WebSocketRecorder,
  WebSocketReplayer,
  prettyJSON,
} from '@exodus/replay'

const recordingResolver = (type) => (dir, name) => [dir, '__recordings__', type, `${name}.json`]

let readRecordingRaw, writeRecording

if (process.env.EXODUS_TEST_ENVIRONMENT === 'bundle') {
  // eslint-disable-next-line no-undef
  const files = EXODUS_TEST_FILES
  const baseFile = files.length === 1 ? files[0] : undefined
  // eslint-disable-next-line no-undef
  const map = typeof EXODUS_TEST_RECORDINGS !== 'undefined' && new Map(EXODUS_TEST_RECORDINGS)
  const resolveRecording = (resolver, f) => resolver(f[0], f[1]).join('/')
  readRecordingRaw = (resolver) => (baseFile ? map.get(resolveRecording(resolver, baseFile)) : null)
} else {
  const fsSync = await import('node:fs')
  const { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, rmdirSync } = fsSync
  const { dirname, basename, normalize, join: pathJoin } = await import('node:path')
  const files = process.argv.slice(1)
  const baseFile = files.length === 1 && existsSync(files[0]) ? normalize(files[0]) : undefined
  const resolveRecording = (resolver) => {
    if (!baseFile) throw new Error('Can not resolve recordings location')
    return pathJoin(...resolver(dirname(baseFile), basename(baseFile)))
  }

  readRecordingRaw = (resolver) => {
    const file = resolveRecording(resolver)
    try {
      if (process.env.EXODUS_TEST_NORMALIZE_RECORDINGS) {
        writeRecording(resolver, JSON.parse(readFileSync(file, 'utf8')))
      }

      return readFileSync(file, 'utf8')
    } catch {
      throw new Error('Fetch log recording does not exist')
    }
  }

  writeRecording = (resolver, entries) => {
    const file = resolveRecording(resolver)
    if (entries.length > 0) {
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, `${prettyJSON(entries)}\n`)
    } else {
      try {
        rmSync(file)
        rmdirSync(dirname(file))
        rmdirSync(dirname(dirname(file)))
      } catch {}
    }
  }
}

function readRecording(resolver) {
  if (!readRecordingRaw) throw new Error('Replaying recordings is not supported in this engine')
  const data = readRecordingRaw(resolver)
  if (typeof data !== 'string') throw new Error('Can not read recording')
  return JSON.parse(data)
}

const log = { websocket: undefined, fetch: undefined }

export function fetchRecord(options) {
  if (log.fetch) throw new Error('Can not record again: already recording or replaying!')
  if (!writeRecording) throw new Error('Writing fetch log is not supported on this engine')
  log.fetch = []
  process.on('exit', () => writeRecording(recordingResolver('fetch'), log.fetch))
  const fetch = fetchRecorder(log.fetch, options)
  globalThis.fetch = fetch
  return fetch
}

export function fetchReplay() {
  if (log.fetch) throw new Error('Can not replay: already recording or replaying!')
  log.fetch = readRecording(recordingResolver('fetch')) // Re-initialized from start on each call
  const fetch = fetchReplayer(log.fetch)
  globalThis.fetch = fetch
  return fetch
}

export function websocketRecord(options) {
  if (log.websocket) throw new Error('Can not record: already recording or replaying!')
  if (!writeRecording) throw new Error('Writing WebSocket log is not supported on this engine')
  log.websocket = []
  process.on('exit', () => writeRecording(recordingResolver('websocket'), log.websocket))
  const WebSocket = WebSocketRecorder(log.websocket, options)
  globalThis.WebSocket = WebSocket
  return WebSocket
}

export function websocketReplay(options) {
  if (log.websocket) throw new Error('Can not replay: already recording or replaying!')
  log.websocket = readRecording(recordingResolver('websocket')) // Re-initialized from start on each call
  const WebSocket = WebSocketReplayer(log.websocket, options)
  globalThis.WebSocket = WebSocket
  return WebSocket
}
