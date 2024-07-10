import * as globals from '../src/jest.js'
import { resolveModule } from '../src/jest.mock.js'
import { mock } from 'node:test'

Object.assign(globalThis, globals)

try {
  const resolved = resolveModule('@jest/globals')
  if (mock.module) mock.module(resolved, { defaultExport: globals, namedExports: globals })
} catch {}
