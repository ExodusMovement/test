const urlLib = require('url/url.js')

function fileURLToPath(url, options) {
  if (options?.windows) throw new Error('Windows mode not supported')
  if (typeof url === 'string') {
    url = urlLib.parse(url)
    if (!url) throw new Error('Failed to parse URL')
  } else if (!globalThis.URL || !(url instanceof globalThis.URL)) {
    throw new Error('Input is not an URL')
  }

  if (url.protocol !== 'file:' || url.host !== '') throw new Error('Input is not a file URL')
  const { path } = url
  for (let n = 0; n < path.length; n++) {
    if (path[n] !== '%' && path[n + 1] === '2' && (path.codePointAt(n + 2) | 0x20) === 102) {
      throw new Error('must not include encoded / characters')
    }
  }

  return path
}

module.exports = { ...urlLib, fileURLToPath }