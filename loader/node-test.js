// Load our impl of node:test for non-node:test engines
import { createRequire } from 'node:module'
import * as test from '../src/node.js'

const require = createRequire(import.meta.url)
const testActual = require('node:test')

for (const key of Object.keys(test)) delete testActual[key]
for (const key of Object.keys(testActual)) delete testActual[key]
Object.assign(testActual, test)

const nodeModule = require('node:module')
const syncBuiltinESMExports = nodeModule.syncBuiltinESMExports || nodeModule.syncBuiltinExports // old bun has it under a different name
if (syncBuiltinESMExports) syncBuiltinESMExports()
