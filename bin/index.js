#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { basename, dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
import glob from 'fast-glob'

const bindir = dirname(fileURLToPath(import.meta.url))

const DEFAULT_PATTERNS = ['**/*.{test,spec}.{js,cjs,mjs,ts}', '**/{test,spec}.{js,cjs,mjs,ts}']

function versionCheck() {
  const [major, minor, patch] = process.versions.node.split('.').map(Number)
  assert((major === 18 && minor >= 13) || major >= 20, 'Node.js version too old!')
  assert(major !== 21, 'Node.js version deprecated!')

  return { major, minor, patch }
}

function parseOptions() {
  const options = {
    jest: false,
    typescript: false,
    esbuild: false,
    babel: false,
    coverage: false,
    passWithNoTests: false,
    writeSnapshots: false,
    coverageEngine: 'c8', // c8 or node
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
        options.typescript = true
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
      case '--passWithNoTests':
        options.passWithNoTests = true
        break
      case '--test-update-snapshots': // Node.js name for this, might get suggested in errors
      case '--write-snapshots':
        options.writeSnapshots = true
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
  if (patterns.length === 0) patterns.push(...DEFAULT_PATTERNS) // defaults

  return { options, patterns }
}

const { major, minor } = versionCheck()
const { options, patterns } = parseOptions()

let program = 'node'

const require = createRequire(import.meta.url)
const resolveRequire = (query) => require.resolve(query)
const resolveImport = import.meta.resolve && ((query) => fileURLToPath(import.meta.resolve(query)))

const c8 = resolveRequire('c8/bin/c8.js')
if (resolveImport) assert.equal(c8, resolveImport('c8/bin/c8.js'))

const args = ['--test', '--no-warnings=ExperimentalWarning']

const haveModuleMocks = major > 22 || (major === 22 && minor >= 3)
if (haveModuleMocks) args.push('--experimental-test-module-mocks')

const haveSnapshots = major > 22 || (major === 22 && minor >= 3)
if (haveSnapshots) args.push('--experimental-test-snapshots')

if (options.writeSnapshots) {
  assert(haveSnapshots, 'For snapshots, use Node.js >=22.3.0')
  args.push('--test-update-snapshots')
}

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

if (options.typescript || options.esbuild) {
  if (major >= 22 || (major === 20 && minor >= 6) || (major === 18 && minor >= 18)) {
    assert(resolveImport)
    args.push('--import', resolveImport('tsx'))
  } else {
    args.push('-r', resolveRequire('tsx/cjs'))
  }
}

if (options.babel) {
  assert(!options.typescript, 'Options --babel and --typescript are mutually exclusive')
  args.push('-r', resolveRequire('./babel.cjs'))
}

// Our loader should be last, as enabling module mocks confuses other loaders
if (options.jest) {
  if (major >= 20 || (major === 18 && minor >= 18)) {
    args.push('--import', resolve(bindir, 'jest.js'))
  } else {
    throw new Error('Option --jest requires Node.js >= v18.18.0')
  }
}

// We need to expand glob patterns for these
const ignore = ['node_modules']
const files = await glob(patterns, { ignore })

if (files.length === 0) {
  if (options.passWithNoTests) {
    console.warn('No tests files found, but passing due to --passWithNoTests')
    process.exit(0)
  }

  console.error('No tests files found!')
  process.exit(1)
}

const tsTests = files.filter((file) => file.endsWith('.ts'))
if (tsTests.length > 0 && !options.typescript) {
  console.error(`Some tests require --typescript flag:\n  ${tsTests.join('\n  ')}`)
  process.exit(1)
} else if (tsTests.length === 0 && options.typescript) {
  console.warn(`Flag --typescript has been used, but there were no TypeScript tests found!`)
}

assert(files.length > 0) // otherwise we can run recursively
args.push(...files)

assert(program && ['node', c8].includes(program))
const node = spawn(program, args, { stdio: 'inherit' })

node.on('close', (code) => {
  process.exitCode = code
})
