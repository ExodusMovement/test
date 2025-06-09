// Not using ./engine.js yet, might pass / embed already loaded config instead
import assert from 'node:assert/strict'
import { specialEnvironments } from './jest.environment.js'

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
  maxConcurrency: 10, // jest has 5, seems too low?
  maxWorkers: undefined, // jest has 50%, also too low, we default to CPUs - 1
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
  const TODO = ['randomize', 'projects', 'roots']
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

  const needPreset = ({ preset }) => preset && !skipPreset.has(preset)
  const resolveGlobalSetup = (config, req) => {
    if (config.globalSetup) config.globalSetup = req.resolve(config.globalSetup) // eslint-disable-line @exodus/mutable/no-param-reassign-prop-only
    if (config.globalTeardown) config.globalTeardown = req.resolve(config.globalTeardown) // eslint-disable-line @exodus/mutable/no-param-reassign-prop-only
  }

  if (needPreset(rawConfig) || rawConfig.globalSetup || rawConfig.globalTeardown) {
    if (process.env.EXODUS_TEST_ENVIRONMENT === 'bundle') {
      throw new Error('jest preset and globalSetup/Teardown not yet supported in bundles')
    } else {
      assert(rawConfig.rootDir)
      const { resolve } = await import('node:path')
      const { createRequire } = await import('node:module')
      const { pathToFileURL } = await import('node:url')
      let requireConfig = createRequire(resolve(rawConfig.rootDir, 'package.json'))
      resolveGlobalSetup(rawConfig, requireConfig)
      while (needPreset(rawConfig)) {
        const suffixes = rawConfig.preset.startsWith('.')
          ? ['']
          : ['/jest-preset.json', '/jest-preset.js', '/jest-preset.cjs', '/jest-preset.mjs']

        let baseConfig
        for (const suffix of suffixes) {
          if (baseConfig) break
          try {
            const resolved = requireConfig.resolve(`${rawConfig.preset}${suffix}`)
            // FIXME: fix linter to allow this
            // const meta = resolved.toLowerCase().endsWith('.json') ? { with: { type: 'json' } } : undefined
            // const presetModule = await import(pathToFileURL(resolved), meta)
            const presetModule = await import(pathToFileURL(resolved))
            requireConfig = createRequire(resolved)
            baseConfig = presetModule.default
          } catch {}
        }

        assert(baseConfig, `Could not load preset: ${rawConfig.preset} `)
        resolveGlobalSetup(baseConfig, requireConfig)
        rawConfig = {
          ...baseConfig,
          ...rawConfig,
          preset: baseConfig.preset,
          setupFiles: [
            ...(baseConfig.setupFiles || []).map((file) => requireConfig.resolve(file)),
            ...(rawConfig.setupFiles || []),
          ],
          setupFilesAfterEnv: [
            ...(baseConfig.setupFilesAfterEnv || []).map((file) => requireConfig.resolve(file)),
            ...(rawConfig.setupFilesAfterEnv || []),
          ],
        }
      }
    }
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

  let dynamicImport
  if (process.env.EXODUS_TEST_ENVIRONMENT === 'bundle') {
    const preloaded = new Map(EXODUS_TEST_PRELOADED) // eslint-disable-line no-undef
    dynamicImport = async (name) => {
      if (preloaded.has(name)) return preloaded.get(name)()
      assert.fail('Requiring non-bundled plugins from bundle is unsupported')
    }
  } else if (config.rootDir) {
    const { resolve } = await import('node:path')
    const { createRequire } = await import('node:module')
    const { pathToFileURL } = await import('node:url')
    const require = createRequire(resolve(config.rootDir, 'package.json'))
    dynamicImport = (path) => {
      // FIXME: fix linter to allow this
      // const meta = path.toLowerCase().endsWith('.json') ? { with: { type: 'json' } } : undefined
      // return import(pathToFileURL(require.resolve(path)), meta)
      return import(pathToFileURL(require.resolve(path)))
    }
  } else {
    dynamicImport = async () => assert.fail('Unreachable: importing plugins without a rootDir')
  }

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
