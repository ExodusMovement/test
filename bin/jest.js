import * as globals from '../src/jest.js'
import { mock } from 'node:test'

Object.assign(globalThis, globals)

if (mock.module) mock.module('@jest/globals', { defaultExport: globals, namedExports: globals })