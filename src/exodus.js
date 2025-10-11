import { mock } from './engine.js'
import * as node from './engine.js'
import { fetchReplay, fetchRecord, websocketRecord, websocketReplay } from './replay.js'
import { timersTrack, timersList, timersDebug, timersAssert } from './timers-track.js'
import { insideEsbuild } from './dark.cjs'

const timersSpeedup = (rate, { apis = ['setTimeout', 'setInterval', 'Date'] } = {}) => {
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

const isBundle = process.env.EXODUS_TEST_ENVIRONMENT === 'bundle' // TODO: improve mocking from bundle
export const exodus = {
  __proto__: null,
  platform: String(process.env.EXODUS_TEST_PLATFORM), // e.g. 'hermes', 'node'
  engine: String(process.env.EXODUS_TEST_ENGINE), // e.g. 'hermes:bundle', 'node:bundle', 'node:test', 'node:pure'
  implementation: String(node.engine), // aka process.env.EXODUS_TEST_CONTEXT, e.g. 'node:test' or 'pure'
  features: {
    __proto__: null,
    dynamicRequire: Boolean(!isBundle), // require(non-literal-non-glob), createRequire()(non-builtin)
    esmMocks: Boolean(mock.module || isBundle), // support for ESM mocks
    esmNamedBuiltinMocks: Boolean(mock.module || isBundle || insideEsbuild()), // support for named ESM imports from builtin module mocks: also fine in --esbuild
    esmInterop: Boolean(insideEsbuild() && !isBundle), // loading/using ESM as CJS, ESM mocks creation without a mocker function
    concurrency: node.engine !== 'pure', // pure engine doesn't support concurrency
  },
  mock: {
    ...{ timersTrack, timersList, timersDebug, timersAssert, timersSpeedup }, // eslint-disable-line unicorn/no-useless-spread
    ...{ fetchRecord, fetchReplay }, // eslint-disable-line unicorn/no-useless-spread
    ...{ websocketRecord, websocketReplay }, // eslint-disable-line unicorn/no-useless-spread
  },
}
