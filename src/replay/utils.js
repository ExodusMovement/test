export const isPlainObject = (x) => x && [null, Object.prototype].includes(Object.getPrototypeOf(x))

// For pretty recordings formatting
export function prettyJSON(data, { width = 120 } = {}) {
  const token = globalThis.crypto?.randomUUID?.()
  if (!token) return JSON.stringify(data, undefined, 2)
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

  const text = JSON.stringify(data, replacer, 2)
  if (objects.length === 0) return text
  return text.replaceAll(new RegExp(`"PRETTY-${token}-(\\d+)"`, 'gu'), (_, i) => objects[Number(i)])
}

// For request comparison, stable key ordering
export const keySortedJSON = (data) =>
  JSON.stringify(data, (_key, value) =>
    isPlainObject(value) ? Object.fromEntries(Object.entries(value).sort()) : value
  )
