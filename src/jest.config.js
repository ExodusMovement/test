import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { specialEnvironments } from './jest.environment.js'

const files = process.argv.slice(1)
const baseDir = files.length === 1 ? path.dirname(path.resolve(files[0])) : undefined

async function getJestConfig(dir) {
  if (!dir) return

  const configPath = (ext) => path.resolve(dir, `jest.config.${ext}`)

  assert(!existsSync(configPath('ts')), 'jest.config.ts is not supported yet with .ts extension')

  const configs = []
  for (const type of ['js', 'ts', 'mjs', 'cjs', 'json']) {
    try {
      if (type === 'json') {
        configs.push(JSON.parse(await readFile(configPath('json'), 'utf8')))
      } else {
        const { default: config } = await import(configPath(type))
        configs.push(config)
      }
    } catch (e) {
      if (!['ERR_MODULE_NOT_FOUND', 'ENOENT'].includes(e.code)) throw e
    }
  }

  try {
    const pkg = JSON.parse(await readFile(path.resolve(dir, 'package.json'), 'utf8'))
    assert(typeof pkg.jest !== 'string', 'String package.json["jest"] values are not supported yet')
    if (pkg.jest) configs.push(pkg.jest)
  } catch (e) {
    if (e.code !== 'ENOENT') throw e
  }

  assert(configs.length < 2, `Multiple jest configs found in ${dir} dir, use only a single one`)

  if (configs.length > 0) {
    const conf = { ...configs[0] }
    assert(!conf.rootDir, 'Jest config.rootDir is not supported yet')
    conf.rootDir = dir
    return conf
  }

  const parent = path.dirname(dir)
  return parent === dir ? undefined : getJestConfig(parent)
}

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
  if (c.moduleDirectories) {
    const valid = ['node_modules']
    assert.deepEqual(c.moduleDirectories, valid, 'Jest config.moduleDirectories is not supported')
  }

  assert(!c.preset, 'Jest config.preset is not supported')

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

  const require = config.rootDir
    ? createRequire(path.resolve(config.rootDir, 'package.json'))
    : () => assert.fail('Unreachable: requiring plugins without a rootDir')

  if (Object.hasOwn(specialEnvironments, c.testEnvironment)) {
    specialEnvironments[c.testEnvironment](require, jestGlobals, c.testEnvironmentOptions)
  }

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
