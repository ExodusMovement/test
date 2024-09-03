const { inspect, isString, isNull, isObject } = require('util/') // dep

// Patched impl from require('util'), added %i

const formatRegExp = /%[%dijs]/g
module.exports = function (f, ...args) {
  if (!isString(f)) return [f, ...args].map((x) => inspect(x)).join(' ')

  let i = 0
  let str = String(f).replace(formatRegExp, function (x) {
    if (x === '%%') return '%'
    if (i >= args.length) return x
    switch (x) {
      case '%s':
        return String(args[i++])
      case '%d':
        return Number(args[i++])
      case '%i':
        return `${parseInt(args[i++])}`
      case '%j':
        try {
          return JSON.stringify(args[i++])
        } catch {
          return '[Circular]'
        }

      default:
        return x
    }
  })

  for (var x = args[i]; i < args.length; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x
    } else {
      str += ' ' + inspect(x)
    }
  }

  return str
}
