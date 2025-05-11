import { mock } from './engine.js'
import * as node from './engine.js'
import { fetchReplay, fetchRecord, websocketRecord, websocketReplay } from './replay.js'
import { insideEsbuild } from './dark.cjs'
import { haveValidTimers } from './version.js'

const isBundle = process.env.EXODUS_TEST_ENVIRONMENT === 'bundle' // TODO: improve mocking from bundle
export const exodus = {
  __proto__: null,
  platform: String(process.env.EXODUS_TEST_PLATFORM), // e.g. 'hermes', 'node'
  engine: String(process.env.EXODUS_TEST_ENGINE), // e.g. 'hermes:bundle', 'node:bundle', 'node:test', 'node:pure'
  implementation: String(node.engine), // aka process.env.EXODUS_TEST_CONTEXT, e.g. 'node:test' or 'pure'
  features: {
    __proto__: null,
    timers: Boolean(mock.timers && haveValidTimers),
    dynamicRequire: Boolean(!isBundle), // require(non-literal-non-glob), createRequire()(non-builtin)
    esmMocks: Boolean(mock.module || isBundle), // support for ESM mocks
    esmNamedBuiltinMocks: Boolean(mock.module || isBundle || insideEsbuild()), // support for named ESM imports from builtin module mocks: also fine in --esbuild
    esmInterop: Boolean(insideEsbuild() && !isBundle), // loading/using ESM as CJS, ESM mocks creation without a mocker function
    concurrency: node.engine !== 'pure', // pure engine doesn't support concurrency
  },
  mock: {
    fetchRecord,
    fetchReplay,
    websocketRecord,
    websocketReplay,
  },
}
