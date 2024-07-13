import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'

const files = process.argv.slice(1)
const baseDir = files.length === 1 ? path.dirname(path.resolve(files[0])) : undefined

async function getJestConfig(dir) {
  if (!dir) return

  try {
    const pkg = JSON.parse(await readFile(path.resolve(dir, 'package.json'), 'utf8'))

    // Only if package.json is found
    let dynamic
    for (const type of ['mjs', 'cjs', 'js']) {
      try {
        const { default: config } = await import(path.resolve(dir, `jest.config.${type}`))
        dynamic = config
        break
      } catch (e) {
        if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e
      }
    }

    if (dynamic === undefined) {
      try {
        dynamic = JSON.parse(await readFile(path.resolve(dir, 'jest.config.json'), 'utf8'))
      } catch (e) {
        if (e.code !== 'ENOENT') throw e
      }
    }

    // We don't deep merge (yet?)
    const conf = { ...pkg.jest, ...dynamic }
    assert(!conf.rootDir, 'Jest config.rootDir is not supported yet')
    conf.rootDir = dir
    return conf
  } catch (e) {
    if (e.code !== 'ENOENT') throw e
  }

  const parent = path.dirname(dir)
  return parent === dir ? undefined : getJestConfig(parent)
}

const normalizeJestConfig = (config) => ({
  testEnvironment: 'node',
  testTimeout: 5000,
  testMatch: ['**/__tests__/**/*.?([cm])[jt]s?(x)', '**/?(*.)+(spec|test).?([cm])[jt]s?(x)'],
  testPathIgnorePatterns: [],
  snapshotSerializers: [],
  injectGlobals: true,
  maxConcurrency: 5,
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

const specialEnvs = {
  __proto__: null,

  'setup-polly-jest/jest-environment-node': (require) => {
    const { Polly } = require('@pollyjs/core')
    const { JestPollyGlobals } = require('setup-polly-jest/lib/common')
    const pollyGlobals = new JestPollyGlobals(globalThis)
    pollyGlobals.isJestPollyEnvironment = true

    beforeEach((t) => {
      if (!pollyGlobals.isPollyActive) return
      pollyGlobals.pollyContext.polly = new Polly(t.fullName, pollyGlobals.pollyContext.options)
    })

    afterEach(async () => {
      if (!pollyGlobals.pollyContext.polly) return
      await pollyGlobals.pollyContext.polly.stop()
      pollyGlobals.pollyContext.polly = null
    })
  },
}

function verifyJestConfig(c) {
  assert(!configUsed, 'Can not apply new config as the current one was already used')

  if (!Object.hasOwn(specialEnvs, c.testEnvironment)) {
    assert.equal(c.testEnvironment, 'node', 'Only "node" testEnvironment is supported')
  }

  const environmentOptions = c.testEnvironmentOptions || {}
  assert.deepEqual(environmentOptions, {}, 'Jest config.testEnvironmentOptions is not supported')

  assert(!c.automock, 'Automocking all modules is not currently supported (config.automock)')
  if (c.moduleDirectories) {
    const valid = ['node_modules']
    assert.deepEqual(c.moduleDirectories, valid, 'Jest config.moduleDirectories is not supported')
  }

  assert(!c.preset, 'Jest config.preset is not supported')

  // TODO
  const TODO = ['globalSetup', 'globalTeardown', 'randomize', 'projects', 'roots', 'testRegex']
  TODO.push('resolver', 'unmockedModulePathPatterns', 'watchPathIgnorePatterns', 'snapshotResolver')
  for (const key of TODO) assert.equal(c[key], undefined, `Jest config.${key} is not supported yet`)
}

let config = normalizeJestConfig({})

let configUsed = false
export const jestConfig = () => {
  configUsed = true
  return config
}

// Methods loadJestConfig() and installJestEnvironment() below are for --jest flag

export async function loadJestConfig(dir = baseDir) {
  config = normalizeJestConfig(await getJestConfig(dir))
  verifyJestConfig(config)
  return config
}

export async function installJestEnvironment(jestGlobals) {
  const { jest, beforeEach } = jestGlobals
  const c = config

  Error.stackTraceLimit = 100

  if (c.injectGlobals) Object.assign(globalThis, jestGlobals)
  if (c.globals) Object.assign(globalThis, config.globals)
  if (c.fakeTimers?.enableGlobally) jest.useFakeTimers()
  if (c.clearMocks) beforeEach(() => jest.clearAllMocks())
  if (c.resetMocks) beforeEach(() => jest.resetAllMocks())
  if (c.restoreMocks) beforeEach(() => jest.restoreAllMocks())
  if (c.resetModules) beforeEach(() => jest.resetModules())

  const require = createRequire(config.rootDir)

  if (Object.hasOwn(specialEnvs, c.testEnvironment)) specialEnvs[c.testEnvironment](require)
  for (const file of c.setupFiles || []) require(file)
  for (const file of c.setupFilesAfterEnv || []) require(file)

  // @jest/globals import auto-mocking is disabled until https://github.com/nodejs/node/issues/53807 is resolved
  /*
  import { mock } from 'node:test'
  try {
    const resolved = require.resolve('@jest/globals')
    if (mock.module) mock.module(resolved, { defaultExport: globals, namedExports: globals })
  } catch {}
  */
}
