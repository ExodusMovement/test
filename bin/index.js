#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { basename, dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
import glob from 'fast-glob'
import { haveModuleMocks, haveSnapshots, haveForceExit } from '../src/version.js'

const bindir = dirname(fileURLToPath(import.meta.url))

const EXTS = `.?([cm])[jt]s?(x)` // we differ from jest, allowing [cm] before everything
const DEFAULT_PATTERNS = [`**/__tests__/**/*${EXTS}`, `**/?(*.)+(spec|test)${EXTS}`]

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
      case '--debug-files':
        options.debug.files = true
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

let program = 'node'

const require = createRequire(import.meta.url)
const resolveRequire = (query) => require.resolve(query)
const resolveImport = import.meta.resolve && ((query) => fileURLToPath(import.meta.resolve(query)))

const c8 = resolveRequire('c8/bin/c8.js')
if (resolveImport) assert.equal(c8, resolveImport('c8/bin/c8.js'))

const args = ['--test', '--no-warnings=ExperimentalWarning', '--test-reporter=spec']

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

if (options.coverage) {
  if (options.coverageEngine === 'node') {
    args.push('--experimental-test-coverage')
  } else if (options.coverageEngine === 'c8') {
    program = c8
    args.unshift('node')
    // perhaps use text-summary ?
    args.unshift('-r', 'text', '-r', 'html')
  } else {
    throw new Error(`Unknown coverage engine: ${JSON.stringify(options.coverageEngine)}`)
  }
}

if (options.esbuild) {
  assert(resolveImport)
  args.push('--import', resolveImport('tsx'))
}

if (options.babel) {
  assert(!options.esbuild, 'Options --babel and --esbuild are mutually exclusive')
  args.push('-r', resolveRequire('./babel.cjs'))
}

const ignore = ['**/node_modules']
let filter
if (process.env.EXODUS_TEST_IGNORE) {
  // fast-glob treats negative ignore patterns exactly the same as positive, let's not cause a confusion
  assert(!process.env.EXODUS_TEST_IGNORE.startsWith('!'), 'Ignore pattern should not be negative')
  ignore.push(process.env.EXODUS_TEST_IGNORE)
}

// Our loader should be last, as enabling module mocks confuses other loaders
if (options.jest) {
  const { loadJestConfig } = await import('../src/jest.config.js')
  const config = await loadJestConfig(process.cwd())
  args.push('--import', resolve(bindir, 'jest.js'))

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
  const subfiles = await glob(process.env.EXODUS_TEST_SELECT, { ignore })

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

assert(files.length > 0) // otherwise we can run recursively
args.push(...files)

if (!Object.hasOwn(process.env, 'NODE_ENV')) process.env.NODE_ENV = 'test'

assert(program && ['node', c8].includes(program))
const node = spawn(program, args, { stdio: 'inherit' })

node.on('close', (code) => {
  process.exitCode = code
})
