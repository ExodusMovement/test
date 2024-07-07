#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { basename, dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
import glob from 'fast-glob' // Only for Node.js <22 support

const bindir = dirname(fileURLToPath(import.meta.url))

const DEFAULT_PATTERNS = ['**/*.{test,spec}.?(c|m)js', '**/*.{test,spec}.ts']

function versionCheck() {
  const [major, minor, patch] = process.versions.node.split('.').map(Number)
  assert((major === 18 && minor >= 13) || major >= 20, 'Node.js version too old!')
  assert(major !== 21, 'Node.js version deprecated!')

  return { major, minor, patch }
}

function parseOptions() {
  const options = {
    global: false,
    typescript: false,
    babel: false,
    coverage: false,
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
      case '--global':
        options.global = true
        break
      case '--typescript':
        options.typescript = true
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

if (major > 22 || (major === 22 && minor >= 3)) args.push('--experimental-test-module-mocks')

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

if (options.typescript) {
  if (major >= 22 || (major === 20 && minor >= 6) || (major === 18 && minor >= 18)) {
    args.push('--enable-source-maps')
    assert(resolveImport)
    args.push('--import', resolveImport('./typescript.js'))
  } else {
    throw new Error('Option --typescript requires Node.js >=20.6.0 || 18 >=18.18.0')
  }
}

if (options.babel) {
  assert(!options.typescript, 'Options --babel and --typescript are mutually exclusive') // did not test actually
  // TODO: are there cases when we should --import it?
  args.push('-r', resolveRequire('@babel/register'))
}

// Our loader should be last, as enabling module mocks confuses other loaders
if (options.global) {
  if (major >= 20 || (major === 18 && minor >= 18)) {
    args.push('--import', resolve(bindir, 'preload.js'))
  } else {
    throw new Error('Option --global requires Node.js >= v18.18.0')
  }
}

if (major === 18 || major === 20) {
  // We need to expand glob patterns for these
  const ignore = ['node_modules']
  const files = await glob(patterns, { ignore })
  assert(files.length > 0, 'No tests found!')
  args.push(...files)
} else if (major >= 22) {
  // Yay we have native glob support
  args.push(...patterns)
} else {
  throw new Error('Unreachable')
}

assert(program && ['node', c8].includes(program))
const node = spawn(program, args, { stdio: 'inherit' })

node.on('close', (code) => {
  process.exitCode = code
})
