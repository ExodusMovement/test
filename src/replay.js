const recordingResolver = (type) => (dir, name) => [dir, '__recordings__', type, `${name}.json`]

let replay
let readRecordingRaw, writeRecording

function loadReplayBundle() {
  // TODO: also under process.features.require_module
  if (process.env.EXODUS_TEST_ENVIRONMENT === 'bundle') {
    replay = require('@exodus/replay') // synchronous
  } else if (!replay) {
    throw new Error('Failed to load @exodus/replay')
  }
}

// Optimized out in 'bundle' env
async function loadNonBundle() {
  // Preload if synchronous lazy-loading is unavailable
  // TODO: not under process?.features?.require_module
  try {
    replay = await import('@exodus/replay')
  } catch {}

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
      writeFileSync(file, `${replay.prettyJSON(entries)}\n`)
    } else {
      try {
        rmSync(file)
        rmdirSync(dirname(file))
        rmdirSync(dirname(dirname(file)))
      } catch {}
    }
  }
}

if (process.env.EXODUS_TEST_ENVIRONMENT === 'bundle') {
  // eslint-disable-next-line no-undef
  const files = EXODUS_TEST_FILES
  const baseFile = files.length === 1 ? files[0] : undefined
  // eslint-disable-next-line no-undef
  const map = new Map(typeof EXODUS_TEST_RECORDINGS === 'undefined' ? [] : EXODUS_TEST_RECORDINGS)
  const resolveRecording = (resolver, f) => resolver(f[0], f[1]).join('/')
  readRecordingRaw = (resolver) => (baseFile ? map.get(resolveRecording(resolver, baseFile)) : null)
} else {
  await loadNonBundle()
}

function readRecording(resolver) {
  const data = readRecordingRaw(resolver)
  if (typeof data !== 'string') throw new Error('Can not read recording')
  return JSON.parse(data)
}

const log = { websocket: undefined, fetch: undefined }

export function fetchRecord(options) {
  loadReplayBundle()
  if (log.fetch) throw new Error('Can not record again: already recording or replaying!')
  if (!writeRecording) throw new Error('Writing fetch log is not supported on this engine')
  log.fetch = []
  process.on('exit', () => writeRecording(recordingResolver('fetch'), log.fetch))
  const fetch = replay.fetchRecorder(log.fetch, options)
  globalThis.fetch = fetch
  return fetch
}

export function fetchReplay() {
  loadReplayBundle()
  if (log.fetch) throw new Error('Can not replay: already recording or replaying!')
  log.fetch = readRecording(recordingResolver('fetch')) // Re-initialized from start on each call
  const fetch = replay.fetchReplayer(log.fetch)
  globalThis.fetch = fetch
  return fetch
}

export function websocketRecord(options) {
  loadReplayBundle()
  if (log.websocket) throw new Error('Can not record: already recording or replaying!')
  if (!writeRecording) throw new Error('Writing WebSocket log is not supported on this engine')
  log.websocket = []
  process.on('exit', () => writeRecording(recordingResolver('websocket'), log.websocket))
  const WebSocket = replay.WebSocketRecorder(log.websocket, options)
  globalThis.WebSocket = WebSocket
  return WebSocket
}

export function websocketReplay(options) {
  loadReplayBundle()
  if (log.websocket) throw new Error('Can not replay: already recording or replaying!')
  log.websocket = readRecording(recordingResolver('websocket')) // Re-initialized from start on each call
  const WebSocket = replay.WebSocketReplayer(log.websocket, options)
  globalThis.WebSocket = WebSocket
  return WebSocket
}
