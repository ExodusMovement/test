// Adapted from https://github.com/ExodusMovement/text-encoding-utf8

/* eslint-disable unicorn/prefer-set-has, unicorn/text-encoding-identifier-case */

const UTF8 = 'utf-8'
const UTF16LE = 'utf-16le'

// https://encoding.spec.whatwg.org/#names-and-labels
const UTF8alias = ['utf8', 'unicode-1-1-utf-8', 'unicode11utf8', 'unicode20utf8', 'x-unicode20utf8']
const UTF16LEalias = ['utf-16', 'ucs-2', 'unicode', 'unicodefeff', 'iso-10646-ucs-2', 'csunicode'] // but not utf16

const normalizeEncoding = (encoding) => {
  const lower = encoding.toLowerCase()
  if (UTF8 === lower || UTF16LE === lower) return lower // fast path
  if (UTF8alias.includes(lower)) return UTF8
  if (UTF16LEalias.includes(lower)) return UTF16LE
  return lower
}

const defineFinal = (obj, key, value) => Object.defineProperty(obj, key, { value, writable: false })

const assertUTF8 = (encoding) => {
  if (encoding !== UTF8) throw new Error('only utf-8 is supported')
}

const assertUTF8orUTF16LE = (enc) => {
  // We don't include ascii because it's an alias to windows-1252 in TextDecoder and differs from Buffer ascii
  // We don't include utf-16be because it's not supported by buffer package
  if (enc !== UTF8 && enc !== UTF16LE) throw new Error('only utf-8 and utf-16le are supported')
}

const fromBufferSouce = (buf) => {
  if (buf instanceof ArrayBuffer) return Buffer.from(buf)
  if (ArrayBuffer.isView(buf)) return Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength)
  if (globalThis.SharedArrayBuffer && buf instanceof globalThis.SharedArrayBuffer) {
    return Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength)
  }

  throw new Error('argument must be a SharedArrayBuffer, ArrayBuffer or ArrayBufferView')
}

// encoding argument is non-standard but catches usage of 'text-encoding' npm package API
// Standard TextEncoder constructor doesn't have any arguments at all and is always utf-8
function TextEncoder(encoding = UTF8) {
  encoding = normalizeEncoding(encoding)
  assertUTF8(encoding)
  defineFinal(this, 'encoding', encoding)
}

TextEncoder.prototype.encode = function (str) {
  const buf = Buffer.from(str)
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.length)
}

TextEncoder.prototype.encodeInto = function (str, ua) {
  if (!(ua instanceof Uint8Array)) throw new Error('second argument must be an Uint8Array')
  const buf = Buffer.from(str)
  if (ua.length < buf.length) throw new Error('Truncation not supported')
  ua.set(buf)
  return { read: str.length, written: buf.length }
}

function TextDecoder(encoding = UTF8, options = {}) {
  encoding = normalizeEncoding(encoding)
  assertUTF8orUTF16LE(encoding)

  const { fatal = false, ignoreBOM = false, stream = false } = options
  if (stream !== false) throw new Error('option "stream" is not supported')

  // see: https://github.com/inexorabletash/text-encoding/blob/master/lib/encoding.js#L1049
  defineFinal(this, 'encoding', encoding)
  defineFinal(this, 'fatal', fatal)
  defineFinal(this, 'ignoreBOM', ignoreBOM)
}

// Note: https://npmjs.com/package/buffer has a bug
// Buffer.from([0xf0, 0x90, 0x80]).toString().length should be 1, but it is 3 in https://npmjs.com/package/buffer
// Buffer.from([0xf0, 0x80, 0x80]).toString().length should be 3, see https://github.com/nodejs/node/issues/16894
TextDecoder.prototype.decode = function (buf, { stream = false } = {}) {
  if (stream) throw new Error('option "stream" is not supported')
  if (buf === undefined) return ''
  buf = fromBufferSouce(buf)
  const res = buf.toString(this.encoding)
  if (this.fatal && res.includes('\uFFFD')) {
    // We have a replacement symbol, recheck if output matches input
    const reconstructed = Buffer.from(res, this.encoding)
    if (Buffer.compare(buf, reconstructed) !== 0) {
      const err = new TypeError('The encoded data was not valid for encoding utf-8')
      err.code = 'ERR_ENCODING_INVALID_ENCODED_DATA'
      throw err
    }
  }

  return !this.ignoreBOM && res.codePointAt(0) === 0xfe_ff ? res.slice(1) : res
}

module.exports = { TextEncoder, TextDecoder }
