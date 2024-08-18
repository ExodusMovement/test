#!/usr/bin/env node

import { spawn, execFile as execFileCallback } from 'node:child_process'
import { promisify, inspect } from 'node:util'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { basename, dirname, resolve, join } from 'node:path'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { existsSync, rmSync, realpathSync } from 'node:fs'
import { unlink } from 'node:fs/promises'
import { tmpdir, availableParallelism } from 'node:os'
import assert from 'node:assert/strict'
import { Queue } from '@chalker/queue'
import glob from 'fast-glob'
import { haveModuleMocks, haveSnapshots, haveForceExit } from '../src/version.js'

const bindir = dirname(fileURLToPath(import.meta.url))

const EXTS = `.?([cm])[jt]s?(x)` // we differ from jest, allowing [cm] before everything
const DEFAULT_PATTERNS = [`**/__tests__/**/*${EXTS}`, `**/?(*.)+(spec|test)${EXTS}`]

const bundleOptions = { pure: true, bundle: true, esbuild: true, ts: 'auto' }
const hermesAv = ['-Og', '-Xmicrotask-queue']
const ENGINES = new Map(
  Object.entries({
    'node:test': { binary: 'node', pure: false, hasImportLoader: true, ts: 'flag' },
    'node:pure': { binary: 'node', pure: true, hasImportLoader: true, ts: 'flag' },
    'node:bundle': { binary: 'node', ...bundleOptions },
    'bun:pure': { binary: 'bun', pure: true, hasImportLoader: false, ts: 'auto' },
    'bun:bundle': { binary: 'bun', ...bundleOptions },
    'deno:bundle': { binary: 'deno', binaryArgs: ['run'], target: 'deno1', ...bundleOptions },
    'd8:bundle': { binary: 'd8', ...bundleOptions },
    'jsc:bundle': { binary: 'jsc', ...bundleOptions, target: 'safari13' },
    'hermes:bundle': { binary: 'hermes', binaryArgs: hermesAv, target: 'es2018', ...bundleOptions },
  })
)

function parseOptions() {
  const options = {
    jest: false,
    typescript: false,
    flow: false,
    esbuild: false,
    babel: false,
    coverage: false,
    coverageEngine: 'c8', // c8 or node
    watch: false,
    only: false,
    passWithNoTests: false,
    writeSnapshots: false,
    debug: { files: false },
    dropNetwork: ![undefined, '', '0'].includes(process.env.EXODUS_TEST_DROP_NETWORK),
    ideaCompat: false,
    engine: process.env.EXODUS_TEST_ENGINE ?? 'node:test',
    require: [],
  }

  const args = [...process.argv]

  // First argument should be node
  assert.equal(basename(args.shift()), 'node')
  assert.equal(basename(process.argv0), 'node')

  // Second argument should be this script
  const jsname = args.shift()
  const pathsEqual = (a, b) => a === b || (existsSync(a) && realpathSync(a) === b) // resolve symlinks
  assert(basename(jsname) === 'exodus-test' || pathsEqual(jsname, fileURLToPath(import.meta.url)))

  while (args[0]?.startsWith('-')) {
    const option = args.shift()
    if (options.ideaCompat) {
      // Ignore some options IntelliJ IDEA is passing
      switch (option) {
        case '--reporters':
          args.shift()
          continue
        case '--verbose':
        case '--runTestsByPath':
        case '--runInBand':
        case '--testTimeout=7200000':
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
        options.esbuild = true
        break
      case '--babel':
        options.babel = true
        break
      case '--require':
        options.require.push(args.shift())
        break
      case '--coverage-engine':
        options.coverageEngine = args.shift()
        break
      case '--coverage':
        options.coverage = true
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
        options.engine = args.shift()
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
      default:
        throw new Error(`Unknown option: ${option}`)
    }
  }

  assert(
    args.every((arg) => !arg.startsWith('--')),
    'Options should come before patterns'
  )

  const patterns = [...args]

  return { options, patterns }
}

const { options, patterns } = parseOptions()

const engineOptions = ENGINES.get(options.engine)
assert(engineOptions, `Unknown engine: ${options.engine}`)
Object.assign(options, engineOptions)
options.platform = options.binary // binary can be overriden by c8

const require = createRequire(import.meta.url)
const resolveRequire = (query) => require.resolve(query)
const resolveImport = import.meta.resolve && ((query) => fileURLToPath(import.meta.resolve(query)))

const args = []
if (options.pure) {
  if (options.bundle) {
    assert(!options.coverage, `Can not use --coverage with ${options.engine} engine`)
    assert(!options.babel, `Can not use --babel with ${options.engine} engine`) // TODO?
  }

  const requiresNodeCoverage = options.coverage && options.coverageEngine === 'node'
  assert(!requiresNodeCoverage, '"--coverage-engine node" requires "--engine node:test" (default)')
  assert(!options.writeSnapshots, `Can not use write snapshots with ${options.engine} engine`)
  assert(!options.forceExit, `Can not use --force-exit with ${options.engine} engine yet`) // TODO
  assert(!options.watch, `Can not use --watch with with ${options.engine} engine`)
} else if (options.engine === 'node:test') {
  args.push('--test', '--no-warnings=ExperimentalWarning', '--test-reporter=spec')

  if (haveModuleMocks) args.push('--experimental-test-module-mocks')
  if (haveSnapshots) args.push('--experimental-test-snapshots')

  if (options.writeSnapshots) {
    assert(haveSnapshots, 'For snapshots, use Node.js >=22.3.0')
    args.push('--test-update-snapshots')
  }

  if (options.forceExit) {
    assert(haveForceExit, 'For forceExit, use Node.js >= 20.14.0')
    args.push('--test-force-exit')
  }

  if (options.watch) args.push('--watch')
  if (options.only) args.push('--test-only')

  args.push('--expose-internals') // this is unoptimal and hopefully temporary, see rationale in src/dark.cjs
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

// The comment below is disabled, we don't auto-mock @jest/globals anymore, and having our loader first is faster
// [Disabled] Our loader should be last, as enabling module mocks confuses other loaders
let jestConfig = null
if (options.jest) {
  const { loadJestConfig } = await import('../src/jest.config.js')
  const config = await loadJestConfig(process.cwd())
  jestConfig = config
  if (!options.bundle) {
    args.push(options.hasImportLoader ? '--import' : '-r', resolve(bindir, 'jest.js'))
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
}

if (options.esbuild && !options.bundle) {
  assert(resolveImport)
  if (options.hasImportLoader) {
    args.push('--import', resolveImport('tsx'))
  } else if (options.engine === process.env.EXODUS_TEST_ENGINE) {
    console.warn(`Warning: ${options.engine} engine does not support --esbuild option`)
  } else {
    console.error(`Error: ${options.engine} engine does not support --esbuild option`)
    process.exit(1)
  }
}

if (options.babel) {
  assert(!options.esbuild, 'Options --babel and --esbuild are mutually exclusive')
  args.push('-r', resolveRequire('./babel.cjs'))
}

if (options.typescript) {
  assert(!options.esbuild, 'Options --typescript and --esbuild are mutually exclusive')
  assert(!options.babel, 'Options --typescript and --babel are mutually exclusive')

  if (options.ts === 'flag') {
    assert(resolveImport)
    assert(options.hasImportLoader)
    // TODO: switch to native --experimental-strip-types where available
    args.push('--import', resolveImport('./typescript.js'))
  } else if (options.ts !== 'auto') {
    throw new Error(`Processing --typescript is not possible with engine ${options.engine}`)
  }
}

for (const r of options.require) {
  assert(!options.bundle, 'Can not use -r with *:bundle engines')
  args.push('-r', r)
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
if (tsTests.length > 0 && !options.esbuild && !options.typescript) {
  console.error(`Some tests require --typescript or --esbuild flag:\n  ${tsTests.join('\n  ')}`)
  process.exit(1)
} else if (!allfiles.some((file) => file.endsWith('.ts')) && options.typescript) {
  console.warn(`Flag --typescript has been used, but there were no TypeScript tests found!`)
}

if (!Object.hasOwn(process.env, 'NODE_ENV')) process.env.NODE_ENV = 'test'

const setEnv = (name, value) => {
  const env = process.env[name]
  if (env && env !== value) throw new Error(`env conflict: ${name}="${env}", effective: "${value}"`)
  process.env[name] = value
}

setEnv('EXODUS_TEST_PLATFORM', options.binary) // e.g. 'hermes', 'node'
setEnv('EXODUS_TEST_ENGINE', options.engine) // e.g. 'hermes:bundle', 'node:bundle', 'node:test', 'node:pure'
setEnv('EXODUS_TEST_ONLY', options.only ? '1' : '')

const c8 = resolveRequire('c8/bin/c8.js')
if (resolveImport) assert.equal(c8, resolveImport('c8/bin/c8.js'))

if (options.coverage) {
  assert.equal(options.binary, 'node', 'Coverage is only supported with Node.js')
  if (options.coverageEngine === 'node') {
    args.push('--experimental-test-coverage')
  } else if (options.coverageEngine === 'c8') {
    args.unshift(options.binary)
    options.binary = c8
    // perhaps use text-summary ?
    args.unshift('-r', 'text', '-r', 'html', '-r', 'lcov', '-r', 'json-summary')
  } else {
    throw new Error(`Unknown coverage engine: ${JSON.stringify(options.coverageEngine)}`)
  }
}

setEnv('EXODUS_TEST_EXECARGV', JSON.stringify(args))
let buildFile

if (options.bundle) {
  const outdir = join(tmpdir(), `exodus-test-${randomUUID().slice(0, 8)}`)
  process.on('exit', () => rmSync(outdir, { recursive: true, force: true }))
  assert.deepEqual(args, [])

  if (options.binary === 'node') args.unshift('--enable-source-maps') // FIXME

  const bundle = await import('./bundle.js')
  await bundle.init({ ...options, outdir, jestConfig })
  buildFile = (file) => bundle.build(file)
}

if (options.dropNetwork) console.warn('--drop-network is a test helper, not a security mechanism')

const execFile = promisify(execFileCallback)

async function launch(binary, args, opts = {}, buffering = false) {
  assert(binary && ['node', 'bun', 'deno', 'd8', 'jsc', 'hermes', c8].includes(binary))
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
  if (options.binary === 'hermes') {
    const dir = dirname(require.resolve('hermes-engine-cli/package.json'))
    switch (process.platform) {
      case 'darwin':
        process.env.PATH = `${join(dir, 'osx-bin')}:${process.env.PATH}`
        break
      case 'linux':
        process.env.PATH = `${join(dir, 'linux64-bin')}:${process.env.PATH}`
        break
      case 'win32':
        process.env.PATH = `${join(dir, 'win64-bin')}:${process.env.PATH}`
        break
      default:
        assert.fail(`Unexpected platform: ${process.platform}`)
    }
  } else if (options.binary === 'jsc' && process.platform === 'darwin') {
    const prefix = '/System/Library/Frameworks/JavaScriptCore.framework/Versions/A'
    for (const dir of [`${prefix}/Helpers`, `${prefix}/Resources`]) {
      if (existsSync(join(dir, 'jsc'))) {
        process.env.PATH = `${dir}:${process.env.PATH}`
        break
      }
    }
  }

  setEnv('EXODUS_TEST_CONTEXT', 'pure')
  console.warn(`${options.engine} engine is experimental and may not work an expected`)

  const runOne = async (inputFile) => {
    const bundled = buildFile ? await buildFile(inputFile) : undefined
    if (buildFile) assert(bundled.file)
    const file = buildFile ? bundled.file : inputFile
    if (bundled?.errors.length > 0) return { ok: false, output: bundled.errors }

    const { binaryArgs = [] } = options
    // Timeout is fallback if timeout in script hangs, 50x as it can be adjusted per-script inside them
    // Do we want to extract timeouts from script code instead? Also, hermes might be slower, so makes sense to increase
    const timeout = (jestConfig?.testTimeout || 5000) * 50
    try {
      const fullArgs = [...binaryArgs, ...args, file]
      const { code = 0, stdout, stderr } = await launch(options.binary, fullArgs, { timeout }, true)
      return { ok: code === 0, output: [stdout, stderr] }
    } catch (err) {
      const { code, stdout = '', stderr = '', signal, killed } = err
      if (code === null) {
        assert(signal)
        const message = `  ${signal}${killed ? ' (killed)' : ''}`
        const comment = killed && signal === 'SIGTERM' ? '  Most likely due to timeout reached' : ''
        return { ok: false, output: [stdout, stderr, message, comment] }
      }

      assert(Number.isInteger(code) && code > 0)
      return { ok: false, output: [stdout, stderr] }
    } finally {
      if (bundled) await unlink(bundled.file)
    }
  }

  const queue = new Queue(availableParallelism() - 1)
  const runConcurrent = async (file) => {
    await queue.claim()
    try {
      // need to await here
      return await runOne(file)
    } finally {
      queue.release()
    }
  }

  const haveColors = process.stdout.hasColors?.()
  const colors = new Map(Object.entries(inspect.colors))
  const color = (text, color) => {
    if (!haveColors || text === '') return text
    if (!colors.has(color)) throw new Error(`Unknown color: ${color}`)
    const [start, end] = colors.get(color)
    return `\x1B[${start}m${text}\x1B[${end}m`
  }

  const format = (chunk) => {
    if (!haveColors) return chunk
    return chunk
      .replaceAll(/^✔ PASS /gmu, color('✔ PASS ', 'green'))
      .replaceAll(/^⏭ SKIP /gmu, color('⏭ SKIP ', 'dim'))
      .replaceAll(/^✖ FAIL /gmu, color('✖ FAIL ', 'red'))
      .replaceAll(/^⚠ WARN /gmu, color('⚠ WARN ', 'blue'))
      .replaceAll(/^‼ FATAL /gmu, `${color('‼', 'red')} ${color(' FATAL ', 'bgRed')} `)
  }

  const failures = []
  const tasks = files.map((file) => ({ file, task: runConcurrent(file) }))
  const timeString = color('Total time', 'dim')
  console.time(timeString)
  for (const { file, task } of tasks) {
    console.log(color(`# ${file}`, 'bold'))
    const { ok, output } = await task
    for (const chunk of output.map((x) => x.trimEnd()).filter(Boolean)) console.log(format(chunk))
    if (!ok) failures.push(file)
  }

  if (failures.length > 0) {
    process.exitCode = 1
    const [total, passed, failed] = [files.length, files.length - failures.length, failures.length]
    const failLine = color(`${failed} / ${total}`, 'red')
    const passLine = color(`${passed} / ${total}`, 'green')
    const suffix = passed > 0 ? color(` (passed: ${passLine})`, 'dim') : ''
    console.log(`${color('Test suites failed:', 'bold')} ${failLine}${suffix}`)
    console.log(color('Failed test suites:', 'red'))
    for (const file of failures) console.log(`  ${file}`) // joining with \n can get truncated, too big
  } else {
    console.log(color(`All ${files.length} test suites passed`, 'green'))
  }

  console.timeEnd(timeString)
} else {
  assert(!buildFile)
  assert(['node', c8].includes(options.binary), `Unexpected native engine: ${options.binary}`)
  assert(['node:test'].includes(options.engine))
  setEnv('EXODUS_TEST_CONTEXT', options.engine)
  assert(files.length > 0) // otherwise we can run recursively
  assert(!options.binaryArgs)
  const { code } = await launch(options.binary, [...args, ...files])
  process.exitCode = code
}
