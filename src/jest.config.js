// Not using ./engine.js yet, might pass / embed already loaded config instead
import assert from 'node:assert/strict'
import { specialEnvironments } from './jest.environment.js'

let dynamicImport
let dynamicImportRoot

async function makeDynamicImport(rootDir) {
  if (dynamicImport) {
    assert(rootDir === dynamicImportRoot, 'Unexpected rootDir change from preset loading')
    return dynamicImport
  }

  dynamicImportRoot = rootDir
  if (process.env.EXODUS_TEST_ENVIRONMENT === 'bundle') {
    const preloaded = new Map(EXODUS_TEST_PRELOADED) // eslint-disable-line no-undef
    dynamicImport = async (name) => {
      if (preloaded.has(name)) return preloaded.get(name)()
      assert.fail('Requiring non-bundled plugins from bundle is unsupported')
    }
  } else if (rootDir) {
    const { resolve } = await import('node:path')
    const { createRequire } = await import('node:module')
    const require = createRequire(resolve(rootDir, 'package.json'))
    dynamicImport = (path) => {
      // FIXME: fix linter to allow this
      // const meta = path.toLowerCase().endsWith('.json') ? { with: { type: 'json' } } : undefined
      // return import(require.resolve(path), meta)
      return import(require.resolve(path))
    }
  } else {
    dynamicImport = async () => assert.fail('Unreachable: importing plugins without a rootDir')
  }
}

const skipPreset = new Set(['ts-jest'])
const EXTS = `.?([cm])[jt]s?(x)` // we differ from jest, allowing [cm] before everything
const normalizeJestConfig = (config) => ({
  testMatch: [`**/__tests__/**/*${EXTS}`, `**/?(*.)+(spec|test)${EXTS}`],
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
  // config.moduleNameMapper is ignored
  if (c.moduleDirectories) {
    const valid = ['node_modules']
    assert.deepEqual(c.moduleDirectories, valid, 'Jest config.moduleDirectories is not supported')
  }

  assert(!c.preset || skipPreset.has(c.preset.split('/')[0]), 'Jest config.preset is not supported')

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
  if (process.env.EXODUS_TEST_JEST_CONFIG === undefined) {
    const { readJestConfig } = await import('./jest.config.fs.js')
    rawConfig = await readJestConfig(...args)
  } else {
    rawConfig = JSON.parse(process.env.EXODUS_TEST_JEST_CONFIG)
  }

  while (rawConfig.preset && !skipPreset.has(rawConfig.preset)) {
    await makeDynamicImport(rawConfig.rootDir)
    const suffixes = rawConfig.preset.startsWith('.')
      ? ['']
      : ['/jest-preset.json', '/jest-preset.js', '/jest-preset.cjs', '/jest-preset.mjs']

    let baseConfig
    for (const suffix of suffixes) {
      if (baseConfig) break
      try {
        const presetModule = await dynamicImport(`${rawConfig.preset}${suffix}`)
        baseConfig = presetModule.default
      } catch {}
    }

    assert(baseConfig, `Could not load preset: ${rawConfig.preset} `)
    rawConfig = { ...baseConfig, ...rawConfig, preset: baseConfig.preset }
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

  await makeDynamicImport(config.rootDir)
  for (const file of c.setupFiles || []) await dynamicImport(file)

  if (Object.hasOwn(specialEnvironments, c.testEnvironment)) {
    const { setup } = specialEnvironments[c.testEnvironment]
    await setup(dynamicImport, engine, jestGlobals, c.testEnvironmentOptions)
  }

  for (const file of c.setupFilesAfterEnv || []) await dynamicImport(file)

  // @jest/globals import auto-mocking is disabled until https://github.com/nodejs/node/issues/53807 is resolved
  /*
  import { mock } from 'node:test'
  try {
    const resolved = require.resolve('@jest/globals')
    if (mock.module) mock.module(resolved, { defaultExport: globals, namedExports: globals })
  } catch {}
  */
}
