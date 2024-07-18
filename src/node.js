import { types } from 'node:util'
import { existsSync, readFileSync } from 'node:fs'
import { normalize, basename, dirname, join as pathJoin } from 'node:path'
import * as nodeTest from 'node:test'
import { createRequire } from 'node:module'

export { default as assert } from 'node:assert/strict'
export { default as assertLoose } from 'node:assert'
export { mock, describe, test, beforeEach, afterEach, before, after } from 'node:test'
export { format as utilFormat } from 'node:util'
export { builtinModules, syncBuiltinESMExports } from 'node:module'

export const isPromise = types.isPromise
export const nodeVersion = process.versions.node

const files = process.argv.slice(1)
export const baseFile = files.length === 1 && existsSync(files[0]) ? normalize(files[0]) : undefined

export const relativeRequire = createRequire(baseFile || import.meta.url)
export const isTopLevelESM = () => !baseFile || !Object.hasOwn(relativeRequire.cache, baseFile) // assume ESM otherwise

export const snapshot = nodeTest.snapshot
let snapshotResolver = (dir, name) => [dir, `${name}.snapshot`] // default per Node.js docs
const resolveSnapshot = (f) => pathJoin(...snapshotResolver(dirname(f), basename(f)))
export const readSnapshot = (f = baseFile) => (f ? readFileSync(resolveSnapshot(f), 'utf8') : null)
export const setSnapshotSerializers = (list) => snapshot?.setDefaultSnapshotSerializers(list)
export const setSnapshotResolver = (fn) => {
  snapshotResolver = fn
  snapshot?.setResolveSnapshotPath(resolveSnapshot)
}
