import { isPlainObject, prettyJSON, keySortedJSON } from './utils.js'

const hex = (width, arr) => [...arr].map((x) => x.toString(16).padStart(width * 2, '0')).join('')

async function serializeBody(body) {
  if (!body || typeof body === 'string') return body
  const proto = Object.getPrototypeOf(body)
  const wrap = (type, data, sub = '', rest = {}) => ({ type, [`data${sub}`]: data, ...rest })
  const wrapHex = (type, width, data) => wrap(type, hex(width, data), '.hex')
  const { Buffer, URLSearchParams, Blob, File, FormData } = globalThis // might be undefined! not cached to allow dynamic polyfills
  if (proto === Buffer?.prototype) return wrap('Buffer', body.toString('base64'), '.base64')
  if (proto === URLSearchParams?.prototype) return wrap('URLSearchParams', `${body}`)
  if (proto === ArrayBuffer.prototype) return wrapHex('ArrayBuffer', 1, new Uint8Array(body))
  if (proto === Uint8Array.prototype) return wrapHex('Uint8Array', 1, body)
  if (proto === Uint16Array.prototype) return wrapHex('Uint16Array', 2, body)
  if (proto === Uint32Array.prototype) return wrapHex('Uint32Array', 4, body)
  if (proto === Blob?.prototype) {
    const { size, type } = body
    return wrap('Blob', hex(1, await body.bytes()), '.hex', { meta: { size, type } })
  }

  if (proto === File?.prototype) {
    const { size, type, name } = body
    return wrap('File', hex(1, await body.bytes()), '.hex', { meta: { size, type, name } })
  }

  if (proto === FormData?.prototype) {
    const data = await Promise.all([...body].map(async ([k, v]) => [k, await serializeBody(v)]))
    return wrap('FormData', data)
  }

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

const serializeRequest = async (resource, options = {}) => {
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
      body: await serializeBody(options.body),
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
    request: await serializeRequest(resource, options),
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
  const wrap = ([name, value]) => [name, { get: () => value, enumerable: true }]
  Object.defineProperties(response, Object.fromEntries(Object.entries(extra).map((el) => wrap(el))))
  return response
}

export function fetchRecorder(log, { fetch: realFetch = globalThis.fetch } = {}) {
  if (!Array.isArray(log)) throw new Error('log should be passed')
  return async function fetch(resource, options) {
    const res = await realFetch(resource, options)
    log.push(await serializeResponse(resource, options, res))
    return res
  }
}

export function fetchReplayer(log) {
  if (!Array.isArray(log)) throw new Error('log should be passed')
  log = log.map((entry) => ({ _request: keySortedJSON(entry.request), ...entry })) // cloned as we mutate it
  return async function fetch(resource, options = {}) {
    const request = keySortedJSON(await serializeRequest(resource, options))
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
}
