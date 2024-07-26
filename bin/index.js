#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { basename, dirname, resolve, join } from 'node:path'
import { createRequire } from 'node:module'
import { randomUUID, randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import assert from 'node:assert/strict'
import glob from 'fast-glob'
import { haveModuleMocks, haveSnapshots, haveForceExit } from '../src/version.js'

const bindir = dirname(fileURLToPath(import.meta.url))

const EXTS = `.?([cm])[jt]s?(x)` // we differ from jest, allowing [cm] before everything
const DEFAULT_PATTERNS = [`**/__tests__/**/*${EXTS}`, `**/?(*.)+(spec|test)${EXTS}`]

const bundleOptions = { pure: true, bundle: true, esbuild: true, ts: 'auto' }
const ENGINES = new Map(
  Object.entries({
    'node:test': { binary: 'node', pure: false, hasImportLoader: true, ts: 'flag' },
    'node:pure': { binary: 'node', pure: true, hasImportLoader: true, ts: 'flag' },
    'node:bundle': { binary: 'node', ...bundleOptions },
    'bun:pure': { binary: 'bun', pure: true, hasImportLoader: false, ts: 'auto' },
    'bun:bundle': { binary: 'bun', ...bundleOptions },
    'deno:bundle': { binary: 'deno', binaryArgs: ['run'], target: 'deno1', ...bundleOptions },
    'jsc:bundle': { binary: 'jsc', ...bundleOptions, target: 'safari11' },
    'hermes:bundle': { binary: 'hermes', binaryArgs: ['-Og'], target: 'es2018', ...bundleOptions },
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
  const { readFile, writeFile } = await import('node:fs/promises')
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

  // These packages throw on import
  const blockedDeps = ['@pollyjs/adapter-node-http', '@pollyjs/node-server']
  const loadPipeline = [
    function (source, args) {
      return source
        .replace(/\bimport\.meta\.url\b/g, JSON.stringify(pathToFileURL(args.path)))
        .replace(/\b(__dirname|import\.meta\.dirname)\b/g, JSON.stringify(dirname(args.path)))
        .replace(/\b(__filename|import\.meta\.filename)\b/g, JSON.stringify(args.path))
    },
    function (source, args) {
      // Just a convenience wrapper to show pretty errors instead of generic bundle-apis/empty/module-throw.cjs
      for (const pkg of blockedDeps) {
        const str = `require(${JSON.stringify(pkg)})`
        assert(!str.includes("'"))
        const err = `module unsupported in bundled form: ${pkg}\n       loaded from ${args.path}`
        const rep = `((() => { throw new Error(${JSON.stringify(err)}) })())`
        for (const sub of [str, str.replaceAll('"', "'")]) source = source.replace(sub, rep)
      }

      return source
    },
  ]

  const writePipeline = []
  if (options.binary === 'hermes') {
    const babel = await import('@babel/core')
    writePipeline.push((source) => {
      const result = babel.transformSync(source, {
        compact: false,
        plugins: [
          '@babel/plugin-transform-arrow-functions',
          '@babel/plugin-transform-async-generator-functions',
          '@babel/plugin-transform-class-properties',
          '@babel/plugin-transform-classes',
          '@babel/plugin-transform-block-scoping',
        ],
      })
      return result.code
    })
  }

  const getPackageFiles = async () => {
    // Returns an empty list on errors
    let patterns
    try {
      patterns = JSON.parse(await readFile('package.json', 'utf8')).files
    } catch {}

    if (!patterns) return []
    // Hack for now, TODO: fix this
    const expanded = patterns.flatMap((x) => (x.includes('.') ? [x] : [x, `${x}/**/*`]))
    return glob(expanded, { ignore: ['**/node_modules'] })
  }

  const buildOne = async (...ifiles) => {
    const input = []
    const importSource = async (file) => input.push(await readFile(resolveRequire(file), 'utf8'))
    const importFile = (...args) => input.push(`await import(${JSON.stringify(resolve(...args))});`)
    const stringify = (x) => ([undefined, null].includes(x) ? `${x}` : JSON.stringify(x))

    if (!['node', c8].includes(options.binary)) {
      if (['jsc', 'hermes'].includes(options.binary)) {
        const entropy = randomBytes(5 * 1024).toString('base64')
        input.push(`globalThis.EXODUS_TEST_CRYPTO_ENTROPY = ${stringify(entropy)};`)
      }

      await importSource('../src/bundle-apis/globals.cjs')
    }

    if (options.jest) {
      assert(jestConfig.rootDir)
      const preload = [...(jestConfig.setupFiles || []), ...(jestConfig.setupFilesAfterEnv || [])]
      if (jestConfig.testEnvironment && jestConfig.testEnvironment !== 'node') {
        const { specialEnvironments } = await import('../src/jest.environment.js')
        assert(Object.hasOwn(specialEnvironments, jestConfig.testEnvironment))
        preload.push(...(specialEnvironments[jestConfig.testEnvironment].dependencies || []))
      }

      const local = createRequire(resolve(jestConfig.rootDir, 'package.json'))
      const w = (f) => `[${stringify(f)}, () => require(${stringify(local.resolve(f))})]`
      input.push(`globalThis.EXODUS_TEST_PRELOADED = [${preload.map((f) => w(f)).join(', ')}]`)
      await importSource('./jest.js')
    }

    for (const file of ifiles) importFile(file)

    const filename =
      ifiles.length === 1 ? `${ifiles[0]}-${randomUUID().slice(0, 8)}` : `bundle-${randomUUID()}`
    const outfile = `${join(outdir, filename)}.js`
    const EXODUS_TEST_SNAPSHOTS = await readSnapshots(ifiles)
    const build = async (opts) => esbuild.build(opts).catch((err) => ({ errors: [err] }))
    let main = input.join('\n')
    if (['jsc', 'hermes'].includes(options.binary)) {
      const exit = `EXODUS_TEST_PROCESS.exitCode = 1; EXODUS_TEST_PROCESS._maybeProcessExitCode();`
      main = `try {\n${main}\n} catch (err) { print(err); ${exit} }`
    }

    const fsfiles = await getPackageFiles()

    const res = await build({
      stdin: {
        contents: `(async function () {\n${main}\n})()`,
        resolveDir: bindir,
      },
      bundle: true,
      outdir,
      entryNames: filename,
      platform: 'neutral',
      mainFields: ['browser', 'module', 'main'],
      define: {
        'process.env.FORCE_COLOR': stringify('0'),
        'process.env.NO_COLOR': stringify('1'),
        'process.env.NODE_ENV': stringify(process.env.NODE_ENV),
        'process.env.EXODUS_TEST_CONTEXT': stringify('pure'),
        'process.env.EXODUS_TEST_ENVIRONMENT': stringify('bundle'),
        'process.env.EXODUS_TEST_PLATFORM': stringify(process.env.EXODUS_TEST_PLATFORM),
        'process.env.EXODUS_TEST_JEST_CONFIG': stringify(JSON.stringify(jestConfig)),
        'process.env.EXODUS_TEST_EXECARGV': stringify(process.env.EXODUS_TEST_EXECARGV),
        'process.env.NODE_DEBUG': stringify(),
        'process.env.DEBUG': stringify(),
        'process.env.READABLE_STREAM': stringify(),
        'process.env.CI': stringify(process.env.CI),
        'process.env.CI_ENABLE_VERBOSE_LOGS': stringify(process.env.CI_ENABLE_VERBOSE_LOGS),
        'process.browser': stringify(true),
        'process.emitWarning': 'undefined',
        'process.stderr': 'undefined',
        'process.stdout': 'undefined',
        'process.type': 'undefined',
        'process.version': stringify('v22.5.1'), // shouldn't depend on currently used Node.js version
        'process.versions.node': stringify('22.5.1'), // see line above
        EXODUS_TEST_FILES: stringify(ifiles.map((f) => [dirname(f), basename(f)])),
        EXODUS_TEST_SNAPSHOTS: stringify(EXODUS_TEST_SNAPSHOTS),
        EXODUS_TEST_FSFILES: stringify(fsfiles.map((file) => resolve(file))), // TODO: can we safely use relative paths?
      },
      alias: {
        // Node browserify
        'node:assert': dirname(dirname(resolveRequire('assert/'))),
        'node:assert/strict': resolveRequire('../src/bundle-apis/assert-strict.cjs'),
        'node:fs': resolveRequire('../src/bundle-apis/fs.cjs'),
        'node:fs/promises': resolveRequire('../src/bundle-apis/fs-promises.cjs'),
        fs: resolveRequire('../src/bundle-apis/fs.cjs'),
        'fs/promises': resolveRequire('../src/bundle-apis/fs-promises.cjs'),
        assert: dirname(dirname(resolveRequire('assert/'))),
        buffer: dirname(resolveRequire('buffer/')),
        child_process: resolveRequire('../src/bundle-apis/child_process.cjs'),
        constants: resolveRequire('constants-browserify'),
        crypto: resolveRequire('../src/bundle-apis/crypto.cjs'),
        events: dirname(resolveRequire('events/')),
        http: resolveRequire('../src/bundle-apis/http.cjs'),
        https: resolveRequire('../src/bundle-apis/https.cjs'),
        os: resolveRequire('os-browserify'),
        path: resolveRequire('path-browserify'),
        querystring: resolveRequire('querystring-es3'),
        stream: resolveRequire('stream-browserify'),
        timers: resolveRequire('timers-browserify'),
        url: dirname(resolveRequire('url/')),
        util: dirname(resolveRequire('util/')),
        zlib: resolveRequire('browserify-zlib'),
        // expect-related deps
        'ansi-styles': resolveRequire('../src/bundle-apis/ansi-styles.cjs'),
        'jest-util': resolveRequire('../src/bundle-apis/jest-util.js'),
        'jest-message-util': resolveRequire('../src/bundle-apis/jest-message-util.js'),
        // unwanted deps
        bindings: resolveRequire('../src/bundle-apis/empty/function-throw.cjs'),
        'node-gyp-build': resolveRequire('../src/bundle-apis/empty/function-throw.cjs'),
        ws: resolveRequire('../src/bundle-apis/ws.cjs'),
        // unsupported deps
        ...Object.fromEntries(
          blockedDeps.map((n) => [n, resolveRequire('../src/bundle-apis/empty/module-throw.cjs')])
        ),
      },
      sourcemap: writePipeline.length > 0 ? 'inline' : 'linked',
      sourcesContent: false,
      keepNames: true,
      format: 'iife',
      target: options.target || `node${process.versions.node}`,
      supported: {
        bigint: true,
      },
      plugins: [
        {
          name: 'exodus-test.bundle',
          setup({ onLoad }) {
            onLoad({ filter: /\.m?js$/, namespace: 'file' }, async (args) => {
              let filepath = args.path
              // Resolve .native versions
              // TODO: move flag to engine options
              // TODO: maybe follow package.json for this
              if (['jsc', 'hermes'].includes(options.binary)) {
                const maybeNative = filepath.replace(/(\.[cm]?js)$/u, '.native$1')
                if (existsSync(maybeNative)) filepath = maybeNative
              }

              let contents = await readFile(filepath, 'utf8')
              for (const transform of loadPipeline) contents = await transform(contents, args)
              return { contents }
            })
          },
        },
      ],
    })

    if (writePipeline.length > 0 && res.errors.length === 0) {
      let contents = await readFile(outfile, 'utf8')
      for (const transform of writePipeline) contents = await transform(contents)
      await writeFile(outfile, contents)
    }

    // require('fs').copyFileSync(outfile, 'tempout.cjs') // DEBUG
    return { file: outfile, errors: res.errors, warnings: res.warnings }
  }

  for (const input of inputs) Object.assign(input, await buildOne(input.file)) // TODO: queued concurrency
}

assert.equal(inputs.length, files.length)
assert(options.binary && ['node', 'bun', 'deno', 'jsc', 'hermes', c8].includes(options.binary))

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

  process.env.EXODUS_TEST_CONTEXT = 'pure'
  console.warn(`\n${options.engine} engine is experimental and may not work an expected\n`)
  const failures = []
  for (const input of inputs) {
    if (input.errors?.length > 0 || input.warnings?.length > 0) {
      failures.push(input.source)
      continue
    }

    const { binaryArgs = [] } = options
    console.log(`# ${input.source}`)
    const node = spawn(options.binary, [...binaryArgs, ...args, input.file], { stdio: 'inherit' })
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
  assert(!options.binaryArgs)
  const node = spawn(options.binary, [...args, ...files], { stdio: 'inherit' })
  const [code] = await once(node, 'close')
  process.exitCode = code
}
