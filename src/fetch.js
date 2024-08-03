let readFetchLog, writeFetchLog

const isPlainObject = (x) => x && [null, Object.prototype].includes(Object.getPrototypeOf(x))

// For pretty recordings formatting
function prettyJSON(data) {
  if (!globalThis.crypto?.randomUUID) return JSON.stringify(data, undefined, 2)
  const token = globalThis.crypto?.randomUUID()
  const objects = []
  if (!token) return JSON.stringify(data, undefined, 2)
  const replacer = (key, value) => {
    if (value && (Array.isArray(value) || isPlainObject(value))) {
      if (isPlainObject(value)) value = Object.fromEntries(Object.entries(value).sort()) // be stable
      const subtext = JSON.stringify(value, null, 1).replaceAll(/\n\s*/gu, ' ')
      const depth = 6 // best guess: '  "": '
      if (key.length + subtext.length + depth <= 100) {
        objects.push(subtext)
        return `PRETTY-${token}-${objects.length - 1}`
      }
    }

    return value
  }

  const text = JSON.stringify(data, replacer, 2)
  return text.replaceAll(new RegExp(`"PRETTY-${token}-(\\d+)"`, 'gu'), (_, i) => objects[Number(i)])
}

if (process.env.EXODUS_TEST_ENVIRONMENT === 'bundle') {
  // TODO: implement readFetchLog
} else {
  const { existsSync, readFileSync, writeFileSync, mkdirSync } = await import('node:fs')
  const { dirname, basename, normalize, join: pathJoin } = await import('node:path')
  const files = process.argv.slice(1)
  const baseFile = files.length === 1 && existsSync(files[0]) ? normalize(files[0]) : undefined
  const recordingResolver = (dir, name) => [dir, '__recordings__', 'fetch', `${name}.json`]
  const resolveRecording = () => {
    if (!baseFile) throw new Error('Can not resolve recordings location')
    return pathJoin(...recordingResolver(dirname(baseFile), basename(baseFile)))
  }

  readFetchLog = () => {
    const file = resolveRecording()
    try {
      return readFileSync(file, 'utf8')
    } catch {
      throw new Error('Fetch log recording does not exist')
    }
  }

  writeFetchLog = (data) => {
    const file = resolveRecording()
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, data)
  }
}

function serializeBody(body) {
  if (!body || typeof body === 'string') return body
  // if (Object.getPrototypeOf(body) === ArrayBuffer.prototype) return [...new Uint8Array(x)] // suboptimal?
  throw new Error('Unsupported body type for fetch recording')
}

function serializeHeaders(headers) {
  if (!headers || Array.isArray(headers)) return headers
  if (isPlainObject(headers)) return Object.entries(headers)
  return [...headers]
}

const serializeRequest = (resource, options = {}) => {
  for (const [key, value] of Object.entries(options)) {
    if (key === 'body' || key === 'headers') continue
    if (!value || typeof value === 'string' || typeof value === 'number') continue
    throw new Error(`Can not process option ${key} with value type ${typeof value}`)
  }

  return {
    resource: `${resource}`,
    options: {
      ...options,
      body: serializeBody(options.body),
      headers: serializeHeaders(options.headers),
    },
  }
}

const serializeResponse = async (resource, options = {}, response) => {
  if (response.type !== 'basic') throw new Error('Can not replay')
  let bodyProperties
  try {
    if (response.headers.get('content-type').trim().split(';')[0] === 'application/json') {
      bodyProperties = { bodyType: 'json', body: await response.clone().json() }
    }
  } catch {}

  if (!bodyProperties) bodyProperties = { bodyType: 'text', body: await response.clone().text() }
  for (const [key, value] of Object.entries(options)) {
    if (key === 'body' || key === 'headers') continue
    if (!value || typeof value === 'string' || typeof value === 'number') continue
    throw new Error(`Can not process option ${key} with value type ${typeof value}`)
  }

  return {
    request: serializeRequest(resource, options),
    status: response.status,
    statusText: response.statusText,
    ok: response.ok,
    headers: [...response.headers],
    url: response.url,
    redirected: response.redirected,
    type: response.type,
    ...bodyProperties,
  }
}

function deserializeResponceBody(body, bodyType) {
  if (bodyType === 'text') return body
  if (bodyType === 'json') return prettyJSON(body)
  throw new Error('Unexpected bodyType in fetch recording log')
}

let log

export function fetchRecord() {
  if (log) throw new Error('Can not record again: already recording!')
  log = []
  process.on('exit', () => writeFetchLog(prettyJSON(log)))
  const realFetch = globalThis.fetch // can not save earlier as we want an overriden version if users overrides it in setup
  globalThis.fetch = async function fetch(resource, options) {
    const res = await realFetch(resource, options)
    log.push(await serializeResponse(resource, options, res))
    return res
  }

  return globalThis.fetch
}

export function fetchReplay() {
  if (log) throw new Error('Can not replay: already recording!')
  // Re-initialized from start on each call
  if (!readFetchLog) throw new Error('Replaying fetch is not supported in this engine')
  const data = readFetchLog()
  if (typeof data !== 'string') throw new Error('Can not read ')
  log = JSON.parse(data)
  for (const entry of log) entry._request = prettyJSON(entry.request)
  globalThis.fetch = async (resource, options = {}) => {
    const request = prettyJSON(serializeRequest(resource, options))
    const id = log.findIndex((entry) => entry._request === request)
    if (id < 0) throw new Error(`Request to ${resource} not found, ${log.length} more entries left`)
    const [entry] = log.splice(id, 1)
    const getHeaders = () => {
      return typeof Headers === 'undefined' ? [...entry.headers] : new Headers(entry.headers || [])
    }

    const { status, statusText, ok, url, redirected, type } = entry
    const props = { status, statusText, ok, url, redirected, type }
    const body = deserializeResponceBody(entry.body, entry.bodyType) // To support clone(), we don't want to actually return original object refs
    const res = {
      ...props,
      headers: getHeaders(),
      text: async () => body,
      json: async () => JSON.parse(body),
      clone: () => ({
        ...res,
        headers: getHeaders(),
      }),
    }
    return res
  }

  return globalThis.fetch
}
