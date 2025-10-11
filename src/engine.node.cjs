const assert = require('node:assert/strict')
const assertLoose = require('node:assert')
const { types, format: utilFormat } = require('node:util')
const { existsSync, readFileSync } = require('node:fs')
const { normalize, basename, dirname, join: pathJoin } = require('node:path')
const { pathToFileURL } = require('node:url')
const { createRequire, builtinModules, syncBuiltinESMExports } = require('node:module')
const nodeTest = require('node:test')

const { mock, describe, test, beforeEach, afterEach, before, after } = nodeTest

const isPromise = types.isPromise
const nodeVersion = process.versions.node
const awaitForMicrotaskQueue = () => new Promise((resolve) => process.nextTick(resolve))

const files = process.argv.slice(1)
const baseFile = files.length === 1 && existsSync(files[0]) ? normalize(files[0]) : undefined
const relativeRequire = baseFile ? createRequire(baseFile) : require
const requireIsRelative = Boolean(baseFile)
const isTopLevelESM = () => !baseFile || !Object.hasOwn(relativeRequire.cache, baseFile) // assume ESM otherwise

const snapshot = nodeTest.snapshot
let snapshotResolver = (dir, name) => [dir, `${name}.snapshot`] // default per Node.js docs
const resolveSnapshot = (f) => pathJoin(...snapshotResolver(dirname(f), basename(f)))
const readSnapshot = (f = baseFile) => (f ? readFileSync(resolveSnapshot(f), 'utf8') : null)
const setSnapshotSerializers = (list) => snapshot?.setDefaultSnapshotSerializers(list)
const setSnapshotResolver = (fn) => {
  snapshotResolver = fn
  snapshot?.setResolveSnapshotPath(resolveSnapshot)
}

const mockModule = mock?.module
  ? (t, o) => {
      try {
        // resolve windows-looking paths, fails on old 20.x/22.x, but non-url works there, hence in try-catch
        if (t.includes('\\')) return mock.module(pathToFileURL(t), o)
      } catch {}

      return mock.module(t, o)
    }
  : undefined

/* eslint-disable unicorn/no-useless-spread */
module.exports = {
  engine: 'node:test',
  ...{ assert, assertLoose },
  ...{ mock, describe, test, beforeEach, afterEach, before, after },
  ...{ builtinModules, syncBuiltinESMExports },
  ...{ utilFormat, isPromise, nodeVersion, awaitForMicrotaskQueue },
  ...{ requireIsRelative, relativeRequire, isTopLevelESM, baseFile, mockModule },
  ...{ readSnapshot, setSnapshotSerializers, setSnapshotResolver },
}
/* eslint-enable unicorn/no-useless-spread */
