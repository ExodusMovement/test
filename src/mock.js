export { fetchReplay, websocketRecord, fetchRecord, websocketReplay } from './replay.js'
export { timersTrack, timersDebug, timersList, timersAssert } from './timers-track.js'

export function timersSpeedup(rate, { apis = ['setTimeout', 'setInterval', 'Date'] } = {}) {
  if (!(typeof rate === 'number' && rate > 0)) throw new TypeError('Expected a positive rate')
  const { setTimeout, setInterval, Date: OrigDate } = globalThis
  for (const api of apis) {
    // eslint-disable-next-line unicorn/prefer-switch
    if (api === 'setTimeout') {
      globalThis.setTimeout = (fn, ms, ...args) => setTimeout(fn, Math.ceil(ms / rate), ...args)
    } else if (api === 'setInterval') {
      globalThis.setInterval = (fn, ms, ...args) => setInterval(fn, Math.ceil(ms / rate), ...args)
    } else if (api === 'Date') {
      const base = OrigDate.now()
      globalThis.Date = class Date extends OrigDate {
        static now = () => base + Math.floor((OrigDate.now() - base) * rate)
        constructor(first = globalThis.Date.now(), ...rest) {
          super(first, ...rest)
        }
      }
    } else {
      throw new Error(`Unknown or unsupported API in timersSpeedup(): ${api}`)
    }
  }
}
