import * as globals from '../src/jest.js'
// import { resolveModule } from '../src/jest.mock.js'
// import { mock } from 'node:test'

Object.assign(globalThis, globals)

// @jest/globals import auto-mocking is disabled until https://github.com/nodejs/node/issues/53807 is resolved
/*
try {
  const resolved = resolveModule('@jest/globals')
  if (mock.module) mock.module(resolved, { defaultExport: globals, namedExports: globals })
} catch {}
*/
