import { mock } from './engine.js'
import * as node from './engine.js'

import { insideEsbuild } from './dark.cjs'

const isBundle = process.env.EXODUS_TEST_ENVIRONMENT === 'bundle' // TODO: improve mocking from bundle

export const platform = String(process.env.EXODUS_TEST_PLATFORM) // e.g. 'hermes', 'node'
export const engine = String(process.env.EXODUS_TEST_ENGINE) // e.g. 'hermes:bundle', 'node:bundle', 'node:test', 'node:pure'
export const implementation = String(node.engine) // aka process.env.EXODUS_TEST_CONTEXT, e.g. 'node:test' or 'pure'

/* eslint-disable jsdoc/check-tag-names */

/**
 * @experimental API might change
 */
export const features = {
  __proto__: null,
  dynamicRequire: Boolean(!isBundle), // require(non-literal-non-glob), createRequire()(non-builtin)
  esmMocks: Boolean(mock.module || isBundle), // support for ESM mocks
  esmNamedBuiltinMocks: Boolean(mock.module || isBundle || insideEsbuild()), // support for named ESM imports from builtin module mocks: also fine in --esbuild
  esmInterop: Boolean(insideEsbuild() && !isBundle), // loading/using ESM as CJS, ESM mocks creation without a mocker function
  concurrency: node.engine !== 'pure', // pure engine doesn't support concurrency
}
