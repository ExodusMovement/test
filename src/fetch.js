let readFetchLog, writeFetchLog

const isPlainObject = (x) => x && [null, Object.prototype].includes(Object.getPrototypeOf(x))

// For pretty recordings formatting
function prettyJSON(data, { sort = false } = {}) {
  const token = globalThis.crypto?.randomUUID?.()
  const objects = []
  const replacer = (key, value) => {
    if (value && (Array.isArray(value) || isPlainObject(value))) {
      if (sort && isPlainObject(value)) value = Object.fromEntries(Object.entries(value).sort()) // be stable
      if (token) {
        const subtext = JSON.stringify(value, null, 1)
          .replaceAll(/\[\n\s*/gu, '[')
          .replaceAll(/\n\s*\]/gu, ']')
          .replaceAll(/\n\s*/gu, ' ')
        const depth = 6 // best guess: '  "": '
        if (key.length + subtext.length + depth <= 100) {
          objects.push(subtext)
          return `PRETTY-${token}-${objects.length - 1}`
        }
      }
    }

    return value
  }

  const text = JSON.stringify(data, replacer, 2)
  if (!token || objects.length === 0) return text
  return text.replaceAll(new RegExp(`"PRETTY-${token}-(\\d+)"`, 'gu'), (_, i) => objects[Number(i)])
}

const recordingResolver = (dir, name) => [dir, '__recordings__', 'fetch', `${name}.json`]
if (process.env.EXODUS_TEST_ENVIRONMENT === 'bundle') {
  // eslint-disable-next-line no-undef
  const files = EXODUS_TEST_FILES
  const baseFile = files.length === 1 ? files[0] : undefined
  // eslint-disable-next-line no-undef
  const map = typeof EXODUS_TEST_RECORDINGS !== 'undefined' && new Map(EXODUS_TEST_RECORDINGS)
  const resolveRecording = (f) => recordingResolver(f[0], f[1]).join('/')
  readFetchLog = () => (baseFile ? map.get(resolveRecording(baseFile)) : null)
} else {
  const fsSync = await import('node:fs')
  const { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, rmdirSync } = fsSync
  const { dirname, basename, normalize, join: pathJoin } = await import('node:path')
  const files = process.argv.slice(1)
  const baseFile = files.length === 1 && existsSync(files[0]) ? normalize(files[0]) : undefined
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

  writeFetchLog = (entries) => {
    const file = resolveRecording()
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

function serializeBody(body) {
  if (!body || typeof body === 'string') return body
  const proto = Object.getPrototypeOf(body)
  const wrap = (type, data, sub = '') => ({ type, [`data${sub}`]: data })
  const { Buffer } = globalThis
  if (proto === Buffer?.prototype) return wrap('Buffer', body.toString('base64'), '.base64')
  if (proto === ArrayBuffer.prototype) return wrap('ArrayBuffer', [...new Uint8Array(body)])
  if (proto === Uint8Array.prototype) return wrap('Uint8Array', [...body])
  throw new Error('Unsupported body type for fetch recording')
}

function serializeHeaders(headers) {
  if (!headers || Array.isArray(headers)) return headers
  if (isPlainObject(headers)) return Object.entries(headers)
  return [...headers]
}

const sortHeaders = (headers) => {
  if (!headers) return headers
  const clone = [...headers]
  return headers.sort((a, b) => {
    if (a[0] < b[0]) return -1
    if (a[0] > b[0]) return 1
    return clone.indexOf(a) - clone.indexOf(b)
  })
}

const serializeRequest = (resource, options = {}) => {
  const serializable = Object.entries(options).filter(([key, value]) => {
    if (key === 'body' || key === 'headers') return false // included directly
    if (key === 'signal') return false // ignored
    if (!value || ['string', 'number', 'boolean'].includes(typeof value)) return true
    throw new Error(`Can not process option ${key} with value type ${typeof value}`)
  })

  return {
    resource: `${resource}`,
    options: {
      ...Object.fromEntries(serializable),
      body: serializeBody(options.body),
      headers: sortHeaders(serializeHeaders(options.headers)),
    },
  }
}

async function serializeResponseBody(response) {
  try {
    if (response.headers.get('content-type').trim().split(';')[0] === 'application/json') {
      return { bodyType: 'json', body: await response.clone().json() }
    }
  } catch {}

  return { bodyType: 'text', body: await response.clone().text() }
}

function deserializeResponseBody(body, bodyType) {
  if (bodyType === 'text') return body
  if (bodyType === 'json') return prettyJSON(body)
  throw new Error('Unexpected bodyType in fetch recording log')
}

const serializeResponse = async (resource, options = {}, response) => {
  if (response.type !== 'basic') throw new Error('Can not record fetch response')
  return {
    request: serializeRequest(resource, options),
    status: response.status,
    statusText: response.statusText,
    ok: response.ok,
    headers: [...response.headers],
    url: response.url,
    redirected: response.redirected,
    type: response.type,
    ...(await serializeResponseBody(response)),
  }
}

let log

export function fetchRecord() {
  if (log) throw new Error('Can not record again: already recording or replaying!')
  if (!writeFetchLog) throw new Error('Writing fetch log is not supported on this engine')
  log = []
  process.on('exit', () => writeFetchLog(log))
  const realFetch = globalThis.fetch // can not save earlier as we want an overriden version if users overrides it in setup
  globalThis.fetch = async function fetch(resource, options) {
    const res = await realFetch(resource, options)
    log.push(await serializeResponse(resource, options, res))
    return res
  }

  return globalThis.fetch
}

function makeResponseBase(bodyType, body, init) {
  if (bodyType === 'json' && Response.json) return Response.json(body, init)
  if (bodyType === 'text' && Response.text) return Response.text(body, init)
  if (bodyType === 'json') return new Response(prettyJSON(body), init)
  if (bodyType === 'text') return new Response(body, init)
  throw new Error('Unexpected bodyType')
}

function makeResponse({ bodyType, body }, { status, statusText, headers, ok, ...extra }) {
  // init supports only { status, statusText, headers } per spec, we have to restore the rest manually
  const response = makeResponseBase(bodyType, body, { status, statusText, headers })
  if (response.ok !== ok) throw new Error('Unexpected: ok mismatch')
  // We have { url, redirected, type } to set here
  const wrapDescriptor = ([name, value]) => [name, { get: () => value, enumerable: true }]
  const descriptors = Object.fromEntries(Object.entries(extra).map((el) => wrapDescriptor(el)))
  Object.defineProperties(response, descriptors)
  return response
}

export function fetchReplay() {
  if (log) throw new Error('Can not replay: already recording or replaying!')
  if (!readFetchLog) throw new Error('Replaying fetch is not supported in this engine')
  const data = readFetchLog() // Re-initialized from start on each call
  if (typeof data !== 'string') throw new Error('Can not read ')
  log = JSON.parse(data)
  for (const entry of log) entry._request = prettyJSON(entry.request, { sort: true })
  globalThis.fetch = async (resource, options = {}) => {
    const request = prettyJSON(serializeRequest(resource, options), { sort: true })
    const id = log.findIndex((entry) => entry._request === request)
    if (id < 0) throw new Error(`Request to ${resource} not found, ${log.length} more entries left`)
    const [entry] = log.splice(id, 1)
    const { status, statusText, ok, url, redirected, type, headers = [], body, bodyType } = entry
    const getHeaders = () => (typeof Headers === 'undefined' ? [...headers] : new Headers(headers))
    const props = { status, statusText, ok, url, redirected, type, headers: getHeaders() }

    // Try to return a native Response
    try {
      if (typeof Response !== 'undefined') return makeResponse({ body, bodyType }, props)
    } catch {} // passthrough and return a plain object

    const bodyText = deserializeResponseBody(body, bodyType) // To support clone(), we don't want to actually return original object refs
    const res = { ...props, text: async () => bodyText, json: async () => JSON.parse(bodyText) }
    res.clone = () => ({ ...res, headers: getHeaders() })
    return res
  }

  return globalThis.fetch
}
