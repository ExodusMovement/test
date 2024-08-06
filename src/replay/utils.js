export const isPlainObject = (x) => x && [null, Object.prototype].includes(Object.getPrototypeOf(x))

const flatten = (json) => json.replaceAll(/(\n\s*},)\n\s*({\n)/g, '$1 $2')

// For pretty recordings formatting
export function prettyJSON(data, { width = 120 } = {}) {
  const token = globalThis.crypto?.randomUUID?.()
  if (!token) return flatten(JSON.stringify(data, undefined, 2))
  const objects = []
  const replacer = (key, value) => {
    if (value && (Array.isArray(value) || isPlainObject(value))) {
      const subtext = JSON.stringify(value, null, 1)
        .replaceAll(/\[\n\s*/gu, '[')
        .replaceAll(/\n\s*\]/gu, ']')
        .replaceAll(/\n\s*/gu, ' ')
      const depth = 6 // best guess: '  "": '
      if (key.length + subtext.length + depth <= width) {
        objects.push(subtext)
        return `PRETTY-${token}-${objects.length - 1}`
      }
    }

    return value
  }

  const text = flatten(JSON.stringify(data, replacer, 2))
  if (objects.length === 0) return text
  return text.replaceAll(new RegExp(`"PRETTY-${token}-(\\d+)"`, 'gu'), (_, i) => objects[Number(i)])
}

// For request comparison, stable key ordering
export const keySortedJSON = (data) =>
  JSON.stringify(data, (_key, value) =>
    isPlainObject(value) ? Object.fromEntries(Object.entries(value).sort()) : value
  )

const hex = (bytes) => [...bytes].map((x) => x.toString(16).padStart(2, '0')).join('')

// For request body and message serialization
// Returns a promise for Blob / File or FormData with Blob / File, is sync otherwise
export function serializeBody(body) {
  if (!body || typeof body === 'string') return body
  const proto = Object.getPrototypeOf(body)
  const wrap = (data, sub = '', r) => ({ type: body.constructor.name, [`data${sub}`]: data, ...r })
  const { Buffer, URLSearchParams, Blob, File, FormData } = globalThis // might be undefined! not cached to allow dynamic polyfills
  if (proto === URLSearchParams?.prototype) return wrap(`${body}`)
  if (proto === Buffer?.prototype) return wrap(body.toString('base64'), '.base64')
  if (proto === Uint8Array.prototype) return wrap(hex(body), '.hex')
  if (proto === ArrayBuffer.prototype) return wrap(hex(new Uint8Array(body)), '.hex')

  const TypedArray = Object.getPrototypeOf(Uint8Array)
  if (body instanceof TypedArray || proto === DataView.prototype) {
    return wrap(hex(new Uint8Array(body.buffer, body.byteOffset, body.byteLength)), '.hex')
  }

  if ([Blob?.prototype, File?.prototype].includes(proto)) {
    const meta = { size: body.size, type: body.type }
    if (body.name !== undefined) meta.name = body.name
    return (async () => wrap(hex(await body.bytes()), '.hex', { meta }))()
  }

  if (proto === FormData?.prototype) {
    const entries = [...body].map(([k, v]) => [k, serializeBody(v)])
    if (!entries.some(([_, v]) => typeof v?.then === 'function')) return wrap(entries) // can be sync then
    return (async () => wrap(await Promise.all(entries.map(async ([k, v]) => [k, await v]))))()
  }

  throw new Error('Unsupported body type for recording')
}
