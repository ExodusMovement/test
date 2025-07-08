#!/usr/bin/env node

import { spawn, execFile as execFileCallback } from 'node:child_process'
import { promisify } from 'node:util'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { basename, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { existsSync, rmSync, realpathSync } from 'node:fs'
import { unlink } from 'node:fs/promises'
import { tmpdir, availableParallelism, homedir } from 'node:os'
import assert from 'node:assert/strict'
// The following make sense only when we run the code in the same Node.js version, i.e. engineOptions.haveIsOk
import * as have from '../src/version.js'
import { findBinary } from './find-binary.js'
import * as browsers from './browsers.js'
import { glob as globImplementation } from '../src/glob.cjs'

const DEFAULT_PATTERNS = [`**/?(*.)+(spec|test).?([cm])[jt]s?(x)`] // do not trust magic dirs by default
const bundleOpts = { pure: true, bundle: true, esbuild: true, ts: 'auto' }
const bareboneOpts = { ...bundleOpts, barebone: true }
const hermesA = ['-Og', '-Xmicrotask-queue']
const denoA = ['run', '--allow-all'] // also will set DENO_COMPAT=1 env flag below
const ENGINES = new Map(
  Object.entries({
    'node:test': { binary: 'node', pure: false, loader: '--import', ts: 'flag', haveIsOk: true },
    'node:pure': { binary: 'node', pure: true, loader: '--import', ts: 'flag', haveIsOk: true },
    'node:bundle': { binary: 'node', ...bundleOpts },
    'bun:pure': { binary: 'bun', pure: true, ts: 'auto' },
    'bun:bundle': { binary: 'bun', ...bundleOpts },
    'electron-as-node:test': { binary: 'electron', pure: false, loader: '--import', ts: 'flag' },
    'electron-as-node:pure': { binary: 'electron', pure: true, loader: '--import', ts: 'flag' },
    'electron-as-node:bundle': { binary: 'electron', ...bundleOpts },
    'electron:bundle': { binary: 'electron', electron: true, ...bundleOpts },
    'deno:test': { binary: 'deno', pure: false, loader: '--preload', ts: 'auto' },
    'deno:pure': { binary: 'deno', binaryArgs: denoA, pure: true, loader: '--preload', ts: 'auto' },
    'deno:bundle': { binary: 'deno', binaryArgs: ['run'], target: 'deno1', ...bundleOpts },
    // Barebone engines
    'd8:bundle': { binary: 'd8', ...bareboneOpts },
    'jsc:bundle': { binary: 'jsc', target: 'safari13', ...bareboneOpts },
    'hermes:bundle': { binary: 'hermes', binaryArgs: hermesA, target: 'es2018', ...bareboneOpts },
    'spidermonkey:bundle': { binary: 'spidermonkey', ...bareboneOpts },
    'engine262:bundle': { binary: 'engine262', ...bareboneOpts },
    'quickjs:bundle': { binary: 'quickjs', binaryArgs: ['--std'], ...bareboneOpts },
    'xs:bundle': { binary: 'xs', ...bareboneOpts },
    'graaljs:bundle': { binary: 'graaljs', ...bareboneOpts },
    'escargot:bundle': { binary: 'escargot', ...bareboneOpts },
    'boa:bundle': { binary: 'boa', binaryArgs: ['-m'], ...bareboneOpts },
    // Browser engines
    'chrome:puppeteer': { binary: 'chrome', browsers: 'puppeteer', ...bundleOpts },
    'firefox:puppeteer': { binary: 'firefox', browsers: 'puppeteer', ...bundleOpts },
    'brave:puppeteer': { binary: 'brave', browsers: 'puppeteer', ...bundleOpts },
    'msedge:puppeteer': { binary: 'msedge', browsers: 'puppeteer', ...bundleOpts },
    'chromium:playwright': { binary: 'chromium', browsers: 'playwright', ...bundleOpts },
    'firefox:playwright': { binary: 'firefox', browsers: 'playwright', ...bundleOpts },
    'webkit:playwright': { binary: 'webkit', browsers: 'playwright', ...bundleOpts },
    'chrome:playwright': { binary: 'chrome', browsers: 'playwright', ...bundleOpts },
    'msedge:playwright': { binary: 'msedge', browsers: 'playwright', ...bundleOpts },
  })
)
const barebonesOk = ['d8', 'spidermonkey', 'quickjs', 'xs', 'hermes']
const barebonesUnhandled = ['jsc', 'escargot', 'boa', 'graaljs', 'engine262']

const getEnvFlag = (name) => {
  if (!Object.hasOwn(process.env, name)) return
  if ([undefined, '', '0', '1'].includes(process.env[name])) return process.env[name] === '1'
  throw new Error(`Unexpected ${name} env value, expected '', '0', or '1'`)
}

function getNumber(arg) {
  assert.equal(`${arg}`, `${Number(arg)}`)
  return Number(arg)
}

function parseOptions() {
  const options = {
    concurrency: undefined, // undefined means unset (can read from config), 0 means auto
    jest: false,
    typescript: false,
    flow: false,
    esbuild: false,
    babel: false,
    coverage: getEnvFlag('EXODUS_TEST_COVERAGE'),
    coverageEngine: process.platform === 'win32' ? 'node' : 'c8', // c8 or node. TODO: can we use c8 on win?
    watch: false,
    only: false,
    passWithNoTests: false,
    writeSnapshots: false,
    devtools: false,
    debug: { files: false },
    dropNetwork: getEnvFlag('EXODUS_TEST_DROP_NETWORK'),
    ideaCompat: false,
    engine: process.env.EXODUS_TEST_ENGINE ?? 'node:test',
    flagEngine: false, // Option combination error reporting differs when engine is passed by flag or env
    entropySize: 5 * 1024,
    require: [],
    testNamePattern: [],
    testTimeout: undefined,
  }

  const args = [...process.argv]

  // First argument should be node
  assert(['node', 'node.exe'].includes(basename(args.shift())))
  assert(['node', 'node.exe'].includes(basename(process.argv0)))

  // Second argument should be this script
  const jsname = args.shift()
  const pathsEqual = (a, b) => a === b || (existsSync(a) && realpathSync(a) === b) // resolve symlinks
  assert(basename(jsname) === 'exodus-test' || pathsEqual(jsname, fileURLToPath(import.meta.url)))

  if (args[0] === '--playwright') {
    const res = browsers.runPlaywrightCommand(args.slice(1))
    process.exitCode = res.status ?? 1
    process.exit(0)
  }

  class OptionValue extends String {}

  while (args[0]?.startsWith('-')) {
    const option = args.shift()
    if (option.includes('=')) {
      const [optionName, ...rest] = option.split('=')
      args.unshift(optionName, new OptionValue(rest.join('=')))
      continue
    }

    if (options.ideaCompat) {
      // Ignore some options IntelliJ IDEA is passing
      switch (option) {
        case '--reporters':
          args.shift()
          continue
        case '--verbose':
        case '--runTestsByPath':
        case '--runInBand':
          continue
      }
    }

    switch (option) {
      case '--global': // compat, will be removed in release
      case '--jest':
        options.jest = true
        break
      case '--typescript':
        options.typescript = true
        break
      case '--flow':
        options.flow = true
        break
      case '--esbuild':
        options.esbuild = args[0] instanceof OptionValue ? String(args.shift()) : '*'
        break
      case '--babel':
        options.babel = true
        break
      case '--require':
        options.require.push(String(args.shift()))
        break
      case '--coverage-engine':
        options.coverageEngine = String(args.shift())
        break
      case '--coverage':
        options.coverage = true
        break
      case '--no-coverage':
        options.coverage = false
        break
      case '--watch':
        options.watch = true
        break
      case '--test-only':
      case '--only':
        options.only = true
        break
      case '--passWithNoTests':
        options.passWithNoTests = true
        break
      case '--test-update-snapshots': // Node.js name for this, might get suggested in errors
      case '--write-snapshots':
        options.writeSnapshots = true
        break
      case '--test-force-exit':
      case '--forceExit':
        options.forceExit = true
        break
      case '--engine':
        options.engine = String(args.shift())
        options.flagEngine = true
        break
      case '--devtools':
      case '--inspect-brk':
        options.devtools = '--inspect-brk'
        break
      case '--inspect-wait':
        if (options.devtools !== '--inspect-brk') options.devtools = '--inspect-wait'
        break
      case '--inspect':
        if (!options.devtools) options.devtools = '--inspect'
        break
      case '--debug-files':
        options.debug.files = true
        break
      case '--colors':
        process.env.FORCE_COLOR = '1'
        break
      case '--no-colors':
        process.env.FORCE_COLOR = '0'
        process.env.NO_COLOR = '1'
        process.env.NODE_DISABLE_COLORS = '1'
        break
      case '--drop-network':
        options.dropNetwork = true
        break
      case '--idea-compat':
        options.ideaCompat = true
        break
      case '--throttle-cpu':
        options.throttle = getNumber(args.shift())
        assert(Number.isInteger(options.throttle) && options.throttle > 0) // throttle x times, 1 is no throttle, 2 is 2x slowdown
        break
      case '--debug-timers':
        setEnv('EXODUS_TEST_TIMERS_TRACK', '1')
        break
      case '--concurrency':
        options.concurrency = getNumber(args.shift())
        assert(Number.isInteger(options.concurrency) && options.concurrency >= 0)
        break
      case '--bundle-entropy-size':
        options.entropySize = Number(args.shift())
        break
      case '-t':
      case '--test-name-pattern':
      case '--testNamePattern':
        options.testNamePattern.push(String(args.shift()))
        break
      case '--testTimeout':
        options.testTimeout = Number(args.shift())
        break
      default:
        throw new Error(`Unknown option: ${option}`)
    }
  }

  const argsArePlainStrings = args.every((arg) => typeof arg === 'string' && !arg.startsWith('--'))
  assert(argsArePlainStrings, 'Options should come before patterns')

  const patterns = [...args]

  return { options, patterns }
}

const isTTY = process.stdout.isTTY
const isCI = process.env.CI
const warnHuman = isTTY && !isCI ? (...args) => console.warn(...args) : () => {}
if (isCI) process.env.FORCE_COLOR = '1' // should support colored output even though not a TTY, overridable with --no-color

const setEnv = (name, value) => {
  const env = process.env[name]
  if (env && env !== value) throw new Error(`env conflict: ${name}="${env}", effective: "${value}"`)
  process.env[name] = value === undefined ? '' : value
}

const { options, patterns } = parseOptions()

const engineName = `${options.engine} engine` // used for warnings to user
const engineFlagError = (flag) => `${engineName} does not support --${flag}`
const engineOptions = ENGINES.get(options.engine)
assert(engineOptions, `Unknown engine: ${options.engine}`)
Object.assign(options, engineOptions)
options.platform = options.binary // binary can be overriden by c8 or electron
const isBrowserLike = options.browsers || options.electron
setEnv('EXODUS_TEST_ENGINE', options.engine) // e.g. 'hermes:bundle', 'node:bundle', 'node:test', 'node:pure'
setEnv('EXODUS_TEST_PLATFORM', options.binary) // e.g. 'hermes', 'node'
setEnv('EXODUS_TEST_TIMEOUT', options.testTimeout)
setEnv('EXODUS_TEST_DEVTOOLS', options.devtools ? '1' : '')
setEnv('EXODUS_TEST_IS_BROWSER', isBrowserLike ? '1' : '')
setEnv('EXODUS_TEST_IS_BAREBONE', options.barebone ? '1' : '')
setEnv('EXODUS_TEST_ENVIRONMENT', options.bundle ? 'bundle' : '') // perhaps switch to _IS_BUNDLED?
if (['deno:pure', 'deno:test'].includes(options.engine)) setEnv('DENO_COMPAT', '1') // https://deno.com/blog/v2.4#deno_compat1

assert(!options.devtools || isBrowserLike || !options.pure, engineFlagError('devtools'))
assert(!options.throttle || options.browsers, engineFlagError('throttle-cpu'))

const args = []

if (have.haveModuleMocks && engineOptions.haveIsOk) {
  args.push('--experimental-test-module-mocks')
}

if (options.pure) {
  if (options.bundle) {
    assert(!options.coverage, `Can not use --coverage with ${engineName}`)
    assert(!options.babel, `Can not use --babel with ${engineName}`) // TODO?
  }

  const requiresNodeCoverage = options.coverage && options.coverageEngine === 'node'
  assert(!requiresNodeCoverage, '"--coverage-engine node" requires "--engine node:test" (default)')
  assert(!options.writeSnapshots, `Can not use write snapshots with ${engineName}`)
  assert(!options.forceExit, `Can not use --force-exit with ${engineName} yet`) // TODO
  assert(!options.watch, `Can not use --watch with with ${engineName}`)
  assert(options.testNamePattern.length === 0, '--test-name-pattern requires node:test engine now')
} else if (options.engine === 'node:test' || options.engine === 'electron-as-node:test') {
  const reporter = import.meta.resolve('./reporter.js')
  args.push('--test', '--no-warnings=ExperimentalWarning', '--test-reporter', reporter)

  if (have.haveSnapshots && engineOptions.haveIsOk) args.push('--experimental-test-snapshots')

  if (options.writeSnapshots) {
    assert(have.haveSnapshots && engineOptions.haveIsOk, 'For snapshots, use Node.js >=22.3.0')
    args.push('--test-update-snapshots')
  }

  if (options.forceExit) {
    assert(have.haveForceExit && engineOptions.haveIsOk, 'For forceExit, use Node.js >= 20.14.0')
    args.push('--test-force-exit')
  }

  if (options.watch) args.push('--watch')
  if (options.only) args.push('--test-only')

  for (const pattern of options.testNamePattern) args.push('--test-name-pattern', pattern)

  args.push('--expose-internals') // this is unoptimal and hopefully temporary, see rationale in src/dark.cjs
} else if (options.engine === 'deno:test') {
  args.push('test', '--allow-all')
  assert(!options.jest, 'deno:test engine does not support --jest yet')
} else {
  throw new Error('Unreachable')
}

const ignore = ['**/node_modules']
let filter
if (process.env.EXODUS_TEST_IGNORE) {
  // fast-glob treats negative ignore patterns exactly the same as positive, let's not cause a confusion
  assert(!process.env.EXODUS_TEST_IGNORE.startsWith('!'), 'Ignore pattern should not be negative')
  ignore.push(process.env.EXODUS_TEST_IGNORE)
}

// This might be used in presets, so has to be loaded before jest
if (options.flow && !options.bundle) args.push('--import', import.meta.resolve('../loader/flow.js'))
if (!options.bundle && !['node:test', 'electron-as-node:test'].includes(options.engine)) {
  args.push(options.loader ?? '-r', import.meta.resolve('../loader/node-test.js'))
}

// The comment below is disabled, we don't auto-mock @jest/globals anymore, and having our loader first is faster
// [Disabled] Our loader should be last, as enabling module mocks confuses other loaders
let jestConfig = null
let globalTeardown
if (options.jest) {
  const { loadJestConfig } = await import('../src/jest.config.js')
  const config = await loadJestConfig(process.cwd())
  jestConfig = config
  if (options.bundle) {
    setEnv('EXODUS_TEST_JEST_CONFIG', JSON.stringify(jestConfig))
  } else {
    args.push(options.loader ?? '-r', import.meta.resolve('../loader/jest.js'))
  }

  if (config.testFailureExitCode !== undefined) {
    if (Number(config.testFailureExitCode) === 0) {
      console.warn('Jest is configured to succeed with exit code 0 on test failures!')
    }

    process.on('exit', (code) => {
      if (code !== 0) process.exitCode = config.testFailureExitCode
    })
  }

  if (patterns.length > 0) {
    // skip, we already have patterns via argv
  } else if (config.testRegex) {
    assert(typeof config.testRegex === 'string', `config.testRegex should be a string`)
    assert(!config.testMatch, 'config.testRegex can not be used together with config.testMatch')
    patterns.push('**/*')
  } else if (config.testMatch) {
    patterns.push(...(Array.isArray(config.testMatch) ? config.testMatch : [config.testMatch]))
  }

  if (config.passWithNoTests) options.passWithNoTests = true
  const testRegex = config.testRegex ? new RegExp(config.testRegex, 'u') : null
  const ignoreRegexes = config.testPathIgnorePatterns.map((x) => new RegExp(x, 'u'))
  if (testRegex || ignoreRegexes.length > 0) {
    filter = (x) => {
      const resolved = `<rootDir>/${x}` // don't actually include cwd, that should be irrelevant
      if (testRegex && !testRegex.test(resolved)) return false
      return !ignoreRegexes.some((r) => r.test(resolved))
    }
  }

  if (config.collectCoverage && options.coverage === undefined) options.coverage = true
  if (config.maxWorkers && options.concurrency === undefined) {
    options.concurrency = config.maxWorkers
  }

  for (const key of ['globalSetup', 'globalTeardown']) {
    if (!config[key]) continue
    const { default: method } = await import(config[key])
    assert(method, `config.${key} does not export a default method`)
    assert(method.length === 0, `Arguments for config.${key} are not supported yet`)
    if (key === 'globalTeardown') {
      globalTeardown = method
    } else {
      await method() // globalSetup
    }
  }
}

if (options.concurrency) {
  const raw = options.concurrency
  let concurrency = raw
  if (typeof raw === 'string') {
    if (/^\d{1,15}%$/u.test(raw)) {
      const perc = Number(raw.slice(0, -1))
      concurrency = Math.max(1, Math.round((perc * availableParallelism()) / 100))
    } else {
      assert(/^\d{1,15}$/u.test(raw), `Wrong concurrency: ${raw}`)
      concurrency = Number(raw)
    }
  }

  assert(Number.isSafeInteger(concurrency) && concurrency >= 1, `Wrong concurrency: ${raw}`)
  options.concurrency = concurrency
}

if (options.esbuild && !options.bundle) {
  setEnv('EXODUS_TEST_ESBUILD', options.esbuild)
  if (options.loader === '--import') {
    const optional = options.esbuild === '*' ? '' : '.optional'
    args.push('--import', import.meta.resolve(`../loader/esbuild${optional}.js`))
  } else if (options.flagEngine === false) {
    // Engine is set via env, --esbuild set via flag. Allow but warn
    console.warn(`Warning: ${engineName} does not support --esbuild option`)
  } else {
    console.error(`Error: ${engineName} does not support --esbuild option`)
    process.exit(1)
  }
}

if (options.babel) {
  assert(!options.esbuild, 'Options --babel and --esbuild are mutually exclusive')
  args.push('-r', import.meta.resolve('../loader/babel.cjs'))
}

if (options.typescript) {
  assert(!options.esbuild, 'Options --typescript and --esbuild are mutually exclusive')
  assert(!options.babel, 'Options --typescript and --babel are mutually exclusive')

  if (options.ts === 'flag') {
    assert(options.loader === '--import')
    // TODO: switch to native --experimental-strip-types where available
    args.push('--import', import.meta.resolve('../loader/typescript.js'))
  } else if (options.ts !== 'auto') {
    throw new Error(`Processing --typescript is not possible with ${engineName}`)
  }
}

for (const r of options.require) {
  assert(!options.bundle, 'Can not use -r with *:bundle engines')
  args.push('-r', r)
}

async function glob(patterns, { ignore, cwd }) {
  const patternsY = patterns.filter((x) => !x.startsWith('!'))
  const patternsN = patterns.filter((x) => x.startsWith('!')).map((x) => x.slice(1))
  return globImplementation(patternsY, { exclude: [...ignore, ...patternsN], cwd })
}

if (patterns.length === 0) patterns.push(...DEFAULT_PATTERNS) // defaults
const globbed = await glob(patterns, { ignore })
const allfiles = filter ? globbed.filter(filter) : globbed

if (allfiles.length === 0) {
  if (options.passWithNoTests) {
    console.warn('No test files found, but passing due to --passWithNoTests')
    process.exit(0)
  }

  console.error('No test files found!')
  process.exit(1)
}

let subfiles // must be a strict subset of allfiles
if (process.env.EXODUS_TEST_SELECT) {
  subfiles = await glob(process.env.EXODUS_TEST_SELECT, { ignore })

  const allSet = new Set(allfiles)
  const stray = subfiles.filter((file) => !allSet.has(file))
  if (stray.length > 0) {
    console.error(`Selected tests should be a subset of all tests:\n  ${stray.join('\n  ')}`)
    process.exit(1)
  }

  if (subfiles.length === 0) {
    console.error('No test files selected due to EXODUS_TEST_SELECT, passing')
    process.exit(0)
  }
}

const files = subfiles ?? allfiles

files.sort((a, b) => {
  const [al, bl] = [a.split('/'), b.split('/')]
  while (al[0] === bl[0]) {
    al.shift()
    bl.shift()
  }

  // First process each file in dir, then subdirs
  if (al.length < 2) return -1
  if (bl.length < 2) return 1
  // Prefer example/ over example-something/
  const [an, bn] = [al, bl].map((list) => list.join(String.fromCodePoint(0)))
  if (an < bn) return -1
  if (an > bn) return 1
  throw new Error('Unreachable')
})

if (options.debug.files) {
  for (const f of files) console.log(f) // joining with \n can get truncated, too big
  process.exit(1) // do not succeed!
}

const tsTests = files.filter((file) => /\.[mc]?tsx?$/u.test(file))
const tsSupport = options.ts === 'auto' || options.esbuild || options.typescript || options.babel
if (tsTests.length > 0 && !tsSupport) {
  console.error(`Some tests require --typescript or --esbuild flag:\n  ${tsTests.join('\n  ')}`)
  process.exit(1)
} else if (!allfiles.some((file) => /\.[cm]?ts$/.test(file)) && options.typescript) {
  console.warn(`Flag --typescript has been used, but there were no TypeScript tests found!`)
}

if (!options.bundle) {
  // uses top-level await, :bundle doesn't have that
  const inband = new Set(files.filter((f) => basename(f).includes('.inband.')))
  if (inband.size > 0) {
    process.env.EXODUS_TEST_INBAND = JSON.stringify([...inband])
    const remaning = files.filter((f) => !inband.has(f))
    files.length = 0
    files.push(fileURLToPath(import.meta.resolve('./inband.js')), ...remaning)
  }
}

if (!Object.hasOwn(process.env, 'NODE_ENV')) process.env.NODE_ENV = 'test'
setEnv('EXODUS_TEST_ONLY', options.only ? '1' : '')

let c8
if (options.coverage) {
  assert.equal(options.binary, 'node', 'Coverage is only supported with Node.js')
  if (options.coverageEngine === 'node') {
    args.push('--experimental-test-coverage')
    if (have.haveCoverExclude && engineOptions.haveIsOk) {
      args.push(
        `--test-coverage-exclude=**/@exodus/test/src/**`,
        `--test-coverage-exclude=${DEFAULT_PATTERNS[0]}`
      )
    }
  } else if (options.coverageEngine === 'c8') {
    c8 = findBinary('c8')
    assert.equal(c8, fileURLToPath(import.meta.resolve('c8/bin/c8.js')))
    args.unshift(options.binary)
    options.binary = c8
    // perhaps use text-summary ?
    args.unshift('-r', 'text', '-r', 'html', '-r', 'lcov', '-r', 'json-summary')
  } else {
    throw new Error(`Unknown coverage engine: ${JSON.stringify(options.coverageEngine)}`)
  }
}

if (options.binary === 'electron') {
  if (isBrowserLike) {
    assert(!options.binaryArgs)
    options.binaryArgs = [fileURLToPath(import.meta.resolve('./electron.js'))]
  } else {
    setEnv('ELECTRON_RUN_AS_NODE', '1')
  }
}

if (options.barebone || options.binary === 'electron') {
  options.binary = findBinary(options.binary)
  options.binaryCanBeAbsolute = true
}

const makeTitle = () => {
  let title = options.browsers === 'puppeteer' ? findBinary(options.binary) : options.binary
  if (options.browsers === 'playwright') return `${title} (Playwright-managed)`
  if (basename(title) === title) return title
  const dir = { '~': `${process.cwd()}/`, '.': `${homedir()}/` }
  if (title.startsWith(dir['~']) && dir['~'].length > 1) title = `./${title.slice(dir['~'].length)}`
  if (title.startsWith(dir['.']) && dir['.'].length > 1) title = `~/${title.slice(dir['.'].length)}`
  return /\s/u.test(title) ? JSON.stringify(title) : title
}

const { color } = await import('./color.js') // can't load before env flags are set
console.info(color(`Engine: ${options.engine}, running on ${makeTitle()}`, 'green'))

const assertBinary = (binary, allowed) => {
  if (allowed.includes(binary)) return
  if (existsSync(binary)) {
    const name = basename(binary.toLowerCase()).replace(/\.exe$/u, '')
    if ((c8 && binary === c8) || (options.binaryCanBeAbsolute && allowed.includes(name))) return
  }

  throw new Error(`Unexpected binary: ${binary}`)
}

setEnv('EXODUS_TEST_EXECARGV', JSON.stringify(args))
let buildFile

if (options.bundle) {
  const outdir = join(tmpdir(), `exodus-test-${randomUUID().slice(0, 8)}`)
  process.on('exit', () => rmSync(outdir, { recursive: true, force: true }))
  assert.deepEqual(args, [])

  if (options.binary === 'node') args.unshift('--enable-source-maps') // FIXME

  const bundle = await import('@exodus/test-bundler/bundle')
  bundle.setResolver((file) => fileURLToPath(import.meta.resolve(`../src/${file}`)))
  await bundle.init({ ...options, outdir, jestConfig })
  buildFile = (file) => bundle.build(file)
}

if (options.dropNetwork) warnHuman('--drop-network is a test helper, not a security mechanism')

const execFile = promisify(execFileCallback)

async function launch(binary, args, opts = {}, buffering = false) {
  if (options.browsers) {
    assert(buffering, 'Unexpected non-buffered browser run')
    const { timeout } = opts
    const { browsers: runner, devtools, dropNetwork, throttle } = options
    return browsers.run(runner, args, { binary, devtools, dropNetwork, timeout, throttle })
  }

  const barebones = [...barebonesOk, ...barebonesUnhandled]
  assertBinary(binary, ['node', 'bun', 'deno', 'electron', ...barebones, 'v8']) // v8 is an alias to d8
  if (binary === c8 && process.platform === 'win32') {
    ;[binary, args] = ['node', [binary, ...args]]
  }

  if (options.dropNetwork) {
    switch (process.platform) {
      case 'darwin':
        ;[binary, args] = ['sandbox-exec', ['-n', 'no-network', binary, ...args]]
        break
      case 'linux':
        ;[binary, args] = ['unshare', ['-n', '-r', binary, ...args]]
        break
      default:
        assert.fail(`--drop-network is not implemented on platform: ${process.platform}`)
    }
  }

  if (buffering) return execFile(binary, args, { maxBuffer: 5 * 1024 * 1024, ...opts }) // 5 MiB just in case
  const child = spawn(binary, args, { stdio: 'inherit', ...opts })
  const [code] = await once(child, 'close')
  return { code }
}

if (options.pure) {
  if (!process.env.FORCE_COLOR && process.stdout.hasColors?.() && process.stderr.hasColors?.()) {
    setEnv('FORCE_COLOR', '1') // Default to color output for subprocesses if our stream supports it
  }

  setEnv('EXODUS_TEST_CONTEXT', 'pure')
  warnHuman(`${engineName} is experimental and may not work an expected`)
  const missUnhandled = barebonesUnhandled.includes(options.platform) || isBrowserLike
  if (missUnhandled) warnHuman(`Warning: ${engineName} does not have unhandled rejections tracking`)
  if (options.engine === 'deno:pure') {
    warnHuman(`${engineName} does not pick up tests importing 'node:test' directly!`)
  }

  const runOne = async (inputFile, attempt = 0) => {
    const bundled = buildFile ? await buildFile(inputFile) : undefined
    if (buildFile) assert(bundled.file)
    const file = buildFile ? bundled.file : inputFile
    if (bundled?.errors.length > 0) return { ok: false, output: bundled.errors }

    const failedBare = 'EXODUS_TEST_FAILED_EXIT_CODE_1'
    const cleanOut = (out) => out.replaceAll(`\n${failedBare}\n`, '\n').replaceAll(failedBare, '')
    const { binaryArgs = [] } = options
    // Timeout is fallback if timeout in script hangs, 50x as it can be adjusted per-script inside them
    // Do we want to extract timeouts from script code instead? Also, hermes might be slower, so makes sense to increase
    const timeout = (options.testTimeout || jestConfig?.testTimeout || 5000) * 50
    const start = process.hrtime.bigint()
    try {
      const fullArgs = [...binaryArgs, ...args, file]
      const { code = 0, stdout, stderr } = await launch(options.binary, fullArgs, { timeout }, true)
      const ms = Number(process.hrtime.bigint() - start) / 1e6
      if (stdout.includes(failedBare)) return { ok: false, output: [cleanOut(stdout), stderr], ms }
      const ok = code === 0 && !/^(✖ FAIL|‼ FATAL) /mu.test(stdout)
      return { ok, output: [stdout, stderr], ms }
    } catch (err) {
      const retryOnXS = new Set(['SIGSEGV', 'SIGBUS'])
      if (options.engine === 'xs:bundle' && retryOnXS.has(err.signal) && attempt < 4) {
        // xs sometimes randomly crashes with SIGSEGV on CI. Allow 5 attempts (allow #0 - #3 to fail)
        return runOne(inputFile, attempt + 1)
      }

      const ms = Number(process.hrtime.bigint() - start) / 1e6
      const { code, stderr = '', signal, killed } = err
      const stdout = cleanOut(err.stdout || '')
      if (code === null) {
        assert(signal)
        const message = `  ${signal}${killed ? ' (killed)' : ''}`
        const comment = killed && signal === 'SIGTERM' ? '  Most likely due to timeout reached' : ''
        return { ok: false, output: [stdout, stderr, message, comment], ms }
      }

      if (Number.isInteger(code) && code > 0) return { ok: false, output: [stdout, stderr], ms } // Expected, test error

      throw err // Internal test runner error, e.g. launch() failed
    } finally {
      if (bundled) await unlink(bundled.file)
    }
  }

  const { Queue } = await import('@chalker/queue')
  const queue = new Queue(options.concurrency || availableParallelism() - 1)
  const runConcurrent = async (file) => {
    await queue.claim()
    try {
      // need to await here
      return await runOne(file)
    } finally {
      queue.release()
    }
  }

  const { format, head, middle, tail, timeLabel, summary } = await import('./reporter.js')

  const failures = []
  const tasks = files.map((file) => ({ file, task: runConcurrent(file) }))
  console.time(timeLabel)
  for (const { file, task } of tasks) {
    head(file)
    const { ok, output, ms } = await task
    middle(file, ok, ms)
    for (const chunk of output.filter((x) => x.trim())) console.log(format(chunk).trimEnd())
    tail(file)
    if (!ok) failures.push(file)
  }

  if (failures.length > 0) process.exitCode = 1
  summary(files, failures)

  if (options.browsers) await browsers.close()
  console.timeEnd(timeLabel)
} else {
  assert(!buildFile)
  assertBinary(options.binary, ['node', 'electron', 'deno'])
  assert(['node:test', 'electron-as-node:test', 'deno:test'].includes(options.engine))
  setEnv('EXODUS_TEST_CONTEXT', 'node:test') // The context is always node:test in this branch
  assert(files.length > 0) // otherwise we can run recursively
  assert(!options.binaryArgs)
  if (options.concurrency) args.push('--test-concurrency', options.concurrency)
  if (['--inspect', '--inspect-brk', '--inspect-wait'].includes(options.devtools)) {
    args.push(options.devtools)
    if (have.haveNetworkInspection) args.push('--experimental-network-inspection')
    console.warn(
      ['--inspect-brk', '--inspect-wait'].includes(options.devtools)
        ? 'Open chrome://inspect/ to connect devtools, waiting'
        : 'Open chrome://inspect/ to connect devtools\nUse --inspect-brk to wait for inspector'
    )
  }

  const { code } = await launch(options.binary, [...args, ...files])
  process.exitCode = code
}

if (globalTeardown) await globalTeardown()
