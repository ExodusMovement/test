#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { basename, dirname, resolve, join } from 'node:path'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
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
    'node:bundle': { binary: 'node', pure: true, bundle: true, esbuild: true },
    'bun:pure': { binary: 'bun', pure: true, hasImportLoader: false },
    'bun:bundle': { binary: 'bun', pure: true, bundle: true, esbuild: true },
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
  if (options.bundle) {
    assert(!options.coverage, `Can not use --coverage with ${options.engine} engine`)
    assert(!options.babel, `Can not use --babel with ${options.engine} engine`) // TODO?
  }

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

process.env.EXODUS_TEST_EXECARGV = JSON.stringify(args)
const inputs = files.map((file) => ({ source: file, file }))

if (options.bundle) {
  const esbuild = await import('esbuild')
  const { readFile } = await import('node:fs/promises')
  const { rmSync } = await import('node:fs')
  const os = await import('node:os')
  const outdir = join(os.tmpdir(), `exodus-test-${randomUUID().slice(0, 8)}`)
  process.on('beforeExit', async () => rmSync(outdir, { recursive: true, force: true }))
  assert.deepEqual(args, [])
  if (options.binary === 'node') args.unshift('--enable-source-maps') // FIXME

  const readSnapshots = async (ifiles) => {
    const snapshots = []
    for (const file of ifiles) {
      for (const resolver of [
        (dir, name) => [dir, `${name}.snapshot`], // node:test
        (dir, name) => [dir, '__snapshots__', `${name}.snap`], // jest
      ]) {
        const snapshotFile = join(...resolver(dirname(file), basename(file)))
        try {
          snapshots.push([snapshotFile, await readFile(snapshotFile, 'utf8')])
        } catch (e) {
          if (e.code !== 'ENOENT') throw e
        }
      }
    }

    return snapshots
  }

  const buildOne = async (...ifiles) => {
    const input = []
    if (options.jest) input.push(await readFile(resolveRequire('./jest.js'), 'utf8'))
    for (const file of ifiles) input.push(`await import(${JSON.stringify(resolve(file))});`) // todo: can we use relative paths?
    const filename =
      ifiles.length === 1 ? `${ifiles[0]}-${randomUUID().slice(0, 8)}` : `bundle-${randomUUID()}`
    const outfile = `${join(outdir, filename)}.js`
    const EXODUS_TEST_SNAPSHOTS = await readSnapshots(ifiles)
    const build = async (opts) => esbuild.build(opts).catch((err) => ({ errors: [err] }))
    const res = await build({
      stdin: {
        contents: `(async () => {${input.join('\n')}})()`,
        resolveDir: bindir,
      },
      bundle: true,
      outdir,
      entryNames: filename,
      platform: 'neutral',
      mainFields: ['browser', 'module', 'main'],
      define: {
        'process.env.FORCE_COLOR': JSON.stringify('0'),
        'process.env.NO_COLOR': JSON.stringify('1'),
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
        'process.env.EXODUS_TEST_CONTEXT': JSON.stringify('pure'),
        'process.env.EXODUS_TEST_ENVIRONMENT': JSON.stringify('bundle'),
        'process.env.EXODUS_TEST_PLATFORM': JSON.stringify(process.env.EXODUS_TEST_PLATFORM),
        'process.env.EXODUS_TEST_JEST_CONFIG': JSON.stringify(JSON.stringify(jestConfig)),
        'process.env.EXODUS_TEST_EXECARGV': JSON.stringify(process.env.EXODUS_TEST_EXECARGV),
        'process.env.NODE_DEBUG': JSON.stringify(''),
        EXODUS_TEST_FILES: JSON.stringify(ifiles.map((f) => [dirname(f), basename(f)])),
        EXODUS_TEST_SNAPSHOTS: JSON.stringify(EXODUS_TEST_SNAPSHOTS),
      },
      alias: {
        'node:assert': 'assert',
        'node:assert/strict': resolveRequire('../src/bundle-apis/assert-strict.cjs'),
        'ansi-styles': resolveRequire('../src/bundle-apis/ansi-styles.cjs'),
        'jest-util': resolveRequire('../src/bundle-apis/jest-util.js'),
        'jest-message-util': resolveRequire('../src/bundle-apis/jest-message-util.js'),
      },
      sourcemap: 'both',
      sourcesContent: false,
      keepNames: true,
      target: `node${process.versions.node}`,
      plugins: [
        {
          name: 'import.meta',
          setup({ onLoad }) {
            onLoad({ filter: /\.m?js$/, namespace: 'file' }, async (args) => {
              const source = await readFile(args.path, 'utf8')
              const contents = source
                .replace(/\bimport\.meta\.url\b/g, JSON.stringify(pathToFileURL(args.path)))
                .replace(/\bimport\.meta\.dirname\b/g, JSON.stringify(dirname(args.path)))
                .replace(/\bimport\.meta\.filename\b/g, JSON.stringify(basename(args.path)))
              return { contents }
            })
          },
        },
      ],
    })

    // require('fs').copyFileSync(outfile, 'tempout.cjs') // DEBUG
    return { file: outfile, errors: res.errors, warnings: res.warnings }
  }

  for (const input of inputs) Object.assign(input, await buildOne(input.file)) // TODO: queued concurrency
}

assert.equal(inputs.length, files.length)
assert(options.binary && ['node', 'bun', c8].includes(options.binary))

if (options.pure) {
  process.env.EXODUS_TEST_CONTEXT = 'pure'
  console.warn(`\n${options.engine} engine is experimental and may not work an expected\n\n`)
  const failures = []
  for (const input of inputs) {
    if (input.errors?.length > 0 || input.warnings?.length > 0) {
      failures.push(input.source)
      continue
    }

    const node = spawn(options.binary, [...args, input.file], { stdio: 'inherit' })
    const [code] = await once(node, 'close')
    if (code !== 0) failures.push(input.source)
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
  assert(files.length > 0) // otherwise we can run recursively
  const node = spawn(options.binary, [...args, ...files], { stdio: 'inherit' })
  const [code] = await once(node, 'close')
  process.exitCode = code
}
