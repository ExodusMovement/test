const getStack = (fn) => {
  const { stackTraceLimit } = Error
  Error.stackTraceLimit = 50
  const err = {}
  Error.captureStackTrace(err, fn)
  const { stack } = err
  Error.stackTraceLimit = stackTraceLimit
  return stack.replace(/^Error\n/u, '')
}

const { setTimeout, setInterval, clearTimeout, clearInterval } = globalThis
const timersMap = new Map()
let timersMockEnabled = false

export const timersTrack = () => {
  const mock = {
    __proto__: null,
    setTimeout(callback, ms, ...args) {
      const wrapped = function (...brgs) {
        timersMap.delete(value)
        return callback.apply(this, brgs)
      }

      const stack = getStack(mock.setTimeout)
      const value = setTimeout(wrapped, ms, ...args)
      timersMap.set(value, { start: Date.now(), ms, stack, callback, args })
      return value
    },
    setInterval(callback, ms, ...args) {
      const stack = getStack(mock.setInterval)
      const value = setInterval(callback, ms, ...args)
      timersMap.set(value, { start: Date.now(), ms, stack, callback, args, repeating: true })
      return value
    },
    clearTimeout(id) {
      timersMap.delete(id)
      return clearTimeout(id)
    },
    clearInterval(id) {
      timersMap.delete(id)
      return clearInterval(id)
    },
  }

  Object.assign(globalThis, mock)
  timersMockEnabled = true
}

export const timersList = () => {
  if (!timersMockEnabled) throw new Error('Use exodus.mock.timersTrack() to enable timer tracking')
  const now = Date.now()
  // we don't provide raw timer values, so this is not misused to clear them
  return [...timersMap.values()].map((entry) =>
    entry.repeating ? entry : { ...entry, remaining: entry.ms + entry.start - now }
  )
}

const timersListFormatted = (comment = '') => {
  const entries = timersList()
  const head = `Timers ${comment}[at ${Date.now()}]: ${entries.length}`
  if (entries.length === 0) return head
  const first = (stack) => stack.split('\n')[0].replace(/^\s+at\s+/u, '') // doesn't have to be robust
  const short = entries.map(
    ({ ms, repeating, remaining, stack }, i) =>
      `  #${i}: ${repeating ? `setInterval each ${ms}` : `setTimeout in ${remaining}`}ms from ${first(stack)}` // eslint-disable-line sonarjs/no-nested-template-literals
  )
  const full = entries.map(
    ({ start, ms, stack, callback, args, repeating }, i) =>
      `  #${i} [at ${start}]: ${repeating ? 'setInterval' : 'setTimeout'}(${callback}, ${ms}${['', ...args].join(', ')})\n${stack}`
  )
  const sep = (n) => '-'.repeat(n)
  return `${sep(60)}\n${head}\n${short.join('\n')}\n ${sep(59)}\n${full.join('\n')}\n${sep(60)}`
}

export const timersDebug = async (...times) => {
  if (!timersMockEnabled) throw new Error('Use exodus.mock.timersTrack() to enable timer tracking')
  console.log(timersListFormatted())
  for (const time of times) {
    await new Promise((resolve) => setTimeout(resolve, time))
    console.log(timersListFormatted(`after additional ${time}ms `))
  }
}

export const timersAssert = () => {
  if (!timersMockEnabled) throw new Error('Use exodus.mock.timersTrack() to enable timer tracking')
  if (timersMap.size === 0) return
  console.log(timersListFormatted())
  throw new Error('timersAssert() failed: there are unfinished timers')
}
