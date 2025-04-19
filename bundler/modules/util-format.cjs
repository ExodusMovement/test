const { inspect: inspectOrig, isString, isNull, isObject } = require('util/') // dep

// Print errors without square brackets
const trim = (x) => x.trim()
const validLine = (x) => x && x !== '@'
const padLine = (line) => `    ${line}`
const pad = (stack) => stack.split('\n').map(trim).filter(validLine).map(padLine).join('\n')
const errorStr = (e) => (e.stack.startsWith(`${e}\n`) ? e.stack : `${e}\n${pad(e.stack)}`.trimEnd())
const inspect = (obj, opts) => (obj instanceof Error ? errorStr(obj) : inspectOrig(obj, opts))

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
