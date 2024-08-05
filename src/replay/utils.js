export const isPlainObject = (x) => x && [null, Object.prototype].includes(Object.getPrototypeOf(x))

// For pretty recordings formatting
const JSON_LINE_WIDTH = 120
export function prettyJSON(data, { sortKeys = false, width = JSON_LINE_WIDTH } = {}) {
  const token = globalThis.crypto?.randomUUID?.()
  const objects = []
  const replacer = (key, value) => {
    if (value && (Array.isArray(value) || isPlainObject(value))) {
      if (sortKeys && isPlainObject(value)) value = Object.fromEntries(Object.entries(value).sort()) // be stable
      if (token) {
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
    }

    return value
  }

  const text = JSON.stringify(data, replacer, 2)
  if (!token || objects.length === 0) return text
  return text.replaceAll(new RegExp(`"PRETTY-${token}-(\\d+)"`, 'gu'), (_, i) => objects[Number(i)])
}
