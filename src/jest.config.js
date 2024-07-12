import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const files = process.argv.slice(1)
const baseDir = files.length === 1 ? path.dirname(path.resolve(files[0])) : undefined

async function getJestConfig(dir) {
  if (!dir) return

  try {
    const pkg = JSON.parse(await readFile(path.resolve(dir, 'package.json'), 'utf8'))
    if (pkg.jest) return pkg.jest
  } catch {}

  const parent = path.dirname(dir)
  return parent === dir ? undefined : getJestConfig(parent)
}

const normalizeJestConfig = (config) => ({
  testEnvironment: 'node',
  snapshotSerializers: [],
  ...config,
  snapshotFormat: {
    // jest-snapshot defaults
    indent: 2,
    escapeRegex: true,
    printFunctionName: false,
    // defaults from https://jestjs.io/docs/configuration#snapshotformat-object
    escapeString: false,
    printBasicPrototype: false,
    // user config
    ...config?.snapshotFormat,
    // not overridable per doc
    compareKeys: undefined,
  },
})

export const config = normalizeJestConfig(await getJestConfig(baseDir))

assert.equal(config.testEnvironment, 'node', 'Only "node" testEnvironment is supported')
