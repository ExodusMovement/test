#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { basename, dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
import glob from 'fast-glob'
import { haveModuleMocks, haveSnapshots, haveForceExit } from '../src/version.js'

const bindir = dirname(fileURLToPath(import.meta.url))

const EXTS = `.?([cm])[jt]s?(x)` // we differ from jest, allowing [cm] before everything
const DEFAULT_PATTERNS = [`**/__tests__/**/*${EXTS}`, `**/?(*.)+(spec|test)${EXTS}`]

const ENGINES = new Map(
  Object.entries({
    'node:test': { binary: 'node', pure: false, hasImportLoader: true },
    'node:pure': { binary: 'node', pure: true, hasImportLoader: true },
    'bun:pure': { binary: 'bun', pure: true, hasImportLoader: false },
  })
)

function parseOptions() {
  const options = {
    jest: false,
    typescript: false,
    esbuild: false,
    babel: false,
    coverage: false,
    coverageEngine: 'c8', // c8 or node
    watch: false,
    only: false,
    passWithNoTests: false,
    writeSnapshots: false,
    debug: { files: false },
    ideaCompat: false,
    engine: process.env.EXODUS_TEST_ENGINE ?? 'node:test',
  }

  const args = [...process.argv]

  // First argument should be node
  assert.equal(basename(args.shift()), 'node')
  assert.equal(basename(process.argv0), 'node')

  // Second argument should be this script
  const jsname = args.shift()
  assert(basename(jsname) === 'exodus-test' || jsname === fileURLToPath(import.meta.url))

  while (args[0]?.startsWith('--')) {
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
        console.warn('Option --typescript is going to be gone or changed. Use --esbuild instead')
        options.typescript = true
        options.esbuild = true
        break
      case '--esbuild':
        options.esbuild = true
        break
      case '--babel':
        options.babel = true
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

const require = createRequire(import.meta.url)
const resolveRequire = (query) => require.resolve(query)
const resolveImport = import.meta.resolve && ((query) => fileURLToPath(import.meta.resolve(query)))

const args = []
if (options.pure) {
  const requiresNodeCoverage = options.coverage && options.coverageEngine === 'node'
  assert(!requiresNodeCoverage, '"--coverage-engine node" requires "--engine node:test" (default)')
  assert(!options.writeSnapshots, `Can not use write snapshots with ${options.engine} engine`)
  assert(!options.forceExit, `Can not use --force-exit with ${options.engine} engine yet`) // TODO
  assert(!options.watch, `Can not use --watch with with ${options.engine} engine`)
  assert(!options.only, `Can not use --only with with ${options.engine} engine yet`) // TODO
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
if (options.jest) {
  const { loadJestConfig } = await import('../src/jest.config.js')
  const config = await loadJestConfig(process.cwd())
  args.push(options.hasImportLoader ? '--import' : '-r', resolve(bindir, 'jest.js'))

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

if (options.esbuild) {
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
if (tsTests.length > 0 && !options.esbuild) {
  console.error(`Some tests require --esbuild flag:\n  ${tsTests.join('\n  ')}`)
  process.exit(1)
} else if (!allfiles.some((file) => file.endsWith('.ts')) && options.typescript) {
  console.warn(`Flag --typescript has been used, but there were no TypeScript tests found!`)
}

if (!Object.hasOwn(process.env, 'NODE_ENV')) process.env.NODE_ENV = 'test'
process.env.EXODUS_TEST_PLATFORM = options.binary

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
    args.unshift('-r', 'text', '-r', 'html')
  } else {
    throw new Error(`Unknown coverage engine: ${JSON.stringify(options.coverageEngine)}`)
  }
}

assert(files.length > 0) // otherwise we can run recursively
assert(options.binary && ['node', 'bun', c8].includes(options.binary))
process.env.EXODUS_TEST_EXECARGV = JSON.stringify(args)

if (options.pure) {
  process.env.EXODUS_TEST_CONTEXT = 'pure'
  console.warn(`\n${options.engine} engine is experimental and may not work an expected\n\n`)
  const failures = []
  for (const file of files) {
    const node = spawn(options.binary, [...args, file], { stdio: 'inherit' })
    const [code] = await once(node, 'close')
    if (code !== 0) failures.push(file)
  }

  if (failures.length > 0) {
    process.exitCode = 1
    const [total, passed, failed] = [files.length, files.length - failures.length, failures.length]
    console.log(`Test suites failed: ${failed} / ${total} (passed: ${passed} / ${total})`)
    console.log('Failed test suites:')
    for (const file of failures) console.log(`  ${file}`) // joining with \n can get truncated, too big
  } else {
    console.log(`All ${files.length} test suites passed`)
  }
} else {
  assert(['node', c8].includes(options.binary), `Unexpected native engine: ${options.binary}`)
  assert(['node:test'].includes(options.engine))
  process.env.EXODUS_TEST_CONTEXT = options.engine
  const node = spawn(options.binary, [...args, ...files], { stdio: 'inherit' })
  const [code] = await once(node, 'close')
  process.exitCode = code
}
