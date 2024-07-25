// Not using ./engine.js yet, might pass / embed already loaded config instead
import assert from 'node:assert/strict'
import { specialEnvironments } from './jest.environment.js'

const normalizeJestConfig = (config) => ({
  testEnvironment: 'node',
  testTimeout: 5000,
  testPathIgnorePatterns: [],
  passWithNoTests: false,
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

function verifyJestConfig(c) {
  assert(!configUsed, 'Can not apply new config as the current one was already used')

  if (!Object.hasOwn(specialEnvironments, c.testEnvironment)) {
    assert.equal(c.testEnvironment, 'node', 'Only "node" testEnvironment is supported')
  }

  const environmentOptions = c.testEnvironmentOptions || {}
  assert.deepEqual(environmentOptions, {}, 'Jest config.testEnvironmentOptions is not supported')

  assert(!c.automock, 'Automocking all modules is not currently supported (config.automock)')
  assert(!c.moduleNameMapper, 'Jest config.moduleNameMapper is not supported')
  if (c.moduleDirectories) {
    const valid = ['node_modules']
    assert.deepEqual(c.moduleDirectories, valid, 'Jest config.moduleDirectories is not supported')
  }

  const pre = new Set(['ts-jest'])
  assert(!c.preset || pre.has(c.preset.split('/')[0]), 'Jest config.preset is not supported')

  // TODO
  const TODO = ['globalSetup', 'globalTeardown', 'randomize', 'projects', 'roots']
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

export async function loadJestConfig(...args) {
  let rawConfig
  if (process.env.EXODUS_TEST_JEST_CONFIG) {
    rawConfig = JSON.parse(process.env.EXODUS_TEST_JEST_CONFIG)
  } else {
    const { readJestConfig } = await import('./jest.config.fs.js')
    rawConfig = await readJestConfig(...args)
  }

  config = normalizeJestConfig(rawConfig)
  verifyJestConfig(config)

  // require is already relative to rootDir
  const cleanFile = (file) => file.replace(/^<rootDir>\//g, './')
  config.setupFiles = config.setupFiles?.map((f) => cleanFile(f))
  config.setupFilesAfterEnv = config.setupFilesAfterEnv?.map((f) => cleanFile(f))

  return config
}

export async function installJestEnvironment(jestGlobals) {
  const engine = await import('./engine.js')

  const { beforeEach } = engine
  const { jest } = jestGlobals
  const c = config

  Error.stackTraceLimit = 100

  if (c.injectGlobals) Object.assign(globalThis, jestGlobals)
  if (c.globals) Object.assign(globalThis, config.globals)
  if (c.fakeTimers?.enableGlobally) jest.useFakeTimers()
  if (c.clearMocks) beforeEach(() => jest.clearAllMocks())
  if (c.resetMocks) beforeEach(() => jest.resetAllMocks())
  if (c.restoreMocks) beforeEach(() => jest.restoreAllMocks())
  if (c.resetModules) beforeEach(() => jest.resetModules())

  let require
  if (process.env.EXODUS_TEST_ENVIRONMENT === 'bundle') {
    const preloaded = new Map(EXODUS_TEST_PRELOADED) // eslint-disable-line no-undef
    require = (name) => {
      if (preloaded.has(name)) return preloaded.get(name)()
      assert.fail('Requiring non-bundled plugins from bundle is unsupported')
    }
  } else if (config.rootDir) {
    const { resolve } = await import('node:path')
    const { createRequire } = await import('node:module')
    require = createRequire(resolve(config.rootDir, 'package.json'))
  } else {
    require = () => assert.fail('Unreachable: requiring plugins without a rootDir')
  }

  for (const file of c.setupFiles || []) require(file)

  if (Object.hasOwn(specialEnvironments, c.testEnvironment)) {
    const { setup } = specialEnvironments[c.testEnvironment]
    await setup(require, engine, jestGlobals, c.testEnvironmentOptions)
  }

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
