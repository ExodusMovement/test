import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { basename, dirname, extname, resolve, join } from 'node:path'
import { createRequire } from 'node:module'
import { randomUUID as uuid, randomBytes } from 'node:crypto'
import * as esbuild from 'esbuild'
import glob from 'fast-glob'

const require = createRequire(import.meta.url)
const resolveRequire = (query) => require.resolve(query)
const resolveImport = import.meta.resolve && ((query) => fileURLToPath(import.meta.resolve(query)))

const readSnapshots = async (files, resolvers) => {
  const snapshots = []
  for (const file of files) {
    for (const resolver of resolvers) {
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

const loadPipeline = [
  function (source, filepath) {
    return source
      .replace(/\bimport\.meta\.url\b/g, JSON.stringify(pathToFileURL(filepath)))
      .replace(/\b(__dirname|import\.meta\.dirname)\b/g, JSON.stringify(dirname(filepath)))
      .replace(/\b(__filename|import\.meta\.filename)\b/g, JSON.stringify(filepath))
  },
]

const options = {}

export const init = async ({ platform, jest, flow, target, jestConfig, outdir, entropySize }) => {
  Object.assign(options, { platform, jest, flow, target, jestConfig, outdir, entropySize })

  if (options.flow) {
    const { default: flowRemoveTypes } = await import('flow-remove-types')
    loadPipeline.unshift((source) => flowRemoveTypes(source, { pretty: true }).toString())
  }

  if (options.platform === 'hermes') {
    const babel = await import('./babel-worker.cjs')
    loadPipeline.push(async (source) => {
      const result = await babel.transformAsync(source, {
        compact: false,
        babelrc: false,
        configFile: false,
        plugins: [
          '@babel/plugin-syntax-typescript',
          '@babel/plugin-syntax-import-attributes',
          '@babel/plugin-transform-block-scoping',
          '@babel/plugin-transform-class-properties',
          '@babel/plugin-transform-classes',
          '@babel/plugin-transform-private-methods',
        ],
      })
      return result.code
    })
  }
}

const hermesSupported = {
  arrow: false,
  class: false, // we get a safeguard check this way that it's not used
  'async-generator': false,
  'const-and-let': false, // have to explicitly set for esbuild to not emit that in helpers, also to get a safeguard check
  'for-await': false,
}

const getPackageFiles = async (dir) => {
  // Returns an empty list on errors
  let patterns
  try {
    patterns = JSON.parse(await readFile(resolve(dir, 'package.json'), 'utf8')).files
  } catch {}

  if (!patterns) {
    const parent = dirname(dir)
    if (parent !== dir) return getPackageFiles(parent)
    return []
  }

  // Hack for now, TODO: fix this
  const expanded = patterns.flatMap((x) => (x.includes('.') ? [x] : [x, `${x}/**/*`]))
  return glob(expanded, { ignore: ['**/node_modules'], cwd: dir, absolute: true })
}

const loadCache = new Map()
const loadSourceFile = async (filepath) => {
  if (!loadCache.has(filepath)) {
    const load = async () => {
      let contents = await readFile(filepath, 'utf8')
      for (const transform of loadPipeline) contents = await transform(contents, filepath)
      return contents
    }

    loadCache.set(filepath, load())
  }

  return loadCache.get(filepath)
}

export const build = async (...files) => {
  const input = []
  const importSource = async (file) => input.push(await loadSourceFile(resolveRequire(file)))
  const importFile = (...args) => input.push(`await import(${JSON.stringify(resolve(...args))});`)
  const stringify = (x) => ([undefined, null].includes(x) ? `${x}` : JSON.stringify(x))

  if (!['node'].includes(options.platform)) {
    if (['jsc', 'hermes', 'd8'].includes(options.platform)) {
      const entropy = randomBytes(options.entropySize ?? 5 * 1024).toString('base64')
      input.push(`globalThis.EXODUS_TEST_CRYPTO_ENTROPY = ${stringify(entropy)};`)
    }

    await importSource('./modules/globals.cjs')
  }

  if (options.jest) {
    const { jestConfig } = options
    const preload = [...(jestConfig.setupFiles || []), ...(jestConfig.setupFilesAfterEnv || [])]
    if (jestConfig.testEnvironment && jestConfig.testEnvironment !== 'node') {
      const { specialEnvironments } = await import('../src/jest.environment.js')
      assert(Object.hasOwn(specialEnvironments, jestConfig.testEnvironment))
      preload.push(...(specialEnvironments[jestConfig.testEnvironment].dependencies || []))
    }

    if (preload.length === 0) {
      input.push(`globalThis.EXODUS_TEST_PRELOADED = []`)
    } else {
      assert(jestConfig.rootDir)
      const local = createRequire(resolve(jestConfig.rootDir, 'package.json'))
      const w = (f) => `[${stringify(f)}, () => require(${stringify(local.resolve(f))})]`
      input.push(`globalThis.EXODUS_TEST_PRELOADED = [${preload.map((f) => w(f)).join(', ')}]`)
    }

    await importSource('../bin/jest.js')
  }

  for (const file of files) importFile(file)

  const filename = files.length === 1 ? `${files[0]}-${uuid().slice(0, 8)}` : `bundle-${uuid()}`
  const outfile = `${join(options.outdir, filename)}.js`
  const EXODUS_TEST_SNAPSHOTS = await readSnapshots(files, [
    (dir, name) => [dir, `${name}.snapshot`], // node:test
    (dir, name) => [dir, '__snapshots__', `${name}.snap`], // jest
  ])
  const EXODUS_TEST_RECORDINGS = await readSnapshots(files, [
    (dir, name) => [dir, '__recordings__', 'fetch', `${name}.json`],
    (dir, name) => [dir, '__recordings__', 'websocket', `${name}.json`],
  ])
  const buildWrap = async (opts) => esbuild.build(opts).catch((err) => err)
  let main = input.join(';\n')
  if (['jsc', 'hermes', 'd8'].includes(options.platform)) {
    const exit = `EXODUS_TEST_PROCESS.exitCode = 1; EXODUS_TEST_PROCESS._maybeProcessExitCode();`
    main = `try {\n${main}\n} catch (err) { print(err); ${exit} }`
  }

  const fsfiles = await getPackageFiles(filename ? dirname(resolve(filename)) : process.cwd())

  const hasBuffer = ['node', 'bun'].includes(options.platform)
  const api = (f) => resolveRequire(`./modules/${f}`)
  const nodeUnprefixed = {
    assert: dirname(dirname(resolveRequire('assert/'))),
    'assert/strict': api('assert-strict.cjs'),
    buffer: hasBuffer ? api('node-buffer.cjs') : dirname(resolveRequire('buffer/')),
    child_process: api('child_process.cjs'),
    constants: resolveRequire('constants-browserify'),
    cluster: api('cluster.cjs'),
    crypto: api('crypto.cjs'),
    events: dirname(resolveRequire('events/')),
    fs: api('fs.cjs'),
    'fs/promises': api('fs-promises.cjs'),
    http: api('http.cjs'),
    https: api('https.cjs'),
    os: resolveRequire('os-browserify'),
    path: resolveRequire('path-browserify'),
    querystring: resolveRequire('querystring-es3'),
    stream: resolveRequire('stream-browserify'),
    timers: resolveRequire('timers-browserify'),
    url: dirname(resolveRequire('url/')),
    util: dirname(resolveRequire('util/')),
    zlib: resolveRequire('browserify-zlib'),
  }
  const res = await buildWrap({
    logLevel: 'silent',
    stdin: {
      contents: `(async function () {\n${main}\n})()`,
      resolveDir: dirname(fileURLToPath(import.meta.url)),
    },
    bundle: true,
    outdir: options.outdir,
    entryNames: filename,
    platform: 'neutral',
    mainFields: ['browser', 'module', 'main'],
    define: {
      'process.env.FORCE_COLOR': stringify('0'),
      'process.env.NO_COLOR': stringify('1'),
      'process.env.NODE_ENV': stringify(process.env.NODE_ENV),
      'process.env.EXODUS_TEST_CONTEXT': stringify('pure'),
      'process.env.EXODUS_TEST_ENVIRONMENT': stringify('bundle'), // always 'bundle'
      'process.env.EXODUS_TEST_PLATFORM': stringify(process.env.EXODUS_TEST_PLATFORM), // e.g. 'hermes', 'node'
      'process.env.EXODUS_TEST_ENGINE': stringify(process.env.EXODUS_TEST_ENGINE), // e.g. 'hermes:bundle', 'node:bundle'
      'process.env.EXODUS_TEST_JEST_CONFIG': stringify(JSON.stringify(options.jestConfig)),
      'process.env.EXODUS_TEST_EXECARGV': stringify(process.env.EXODUS_TEST_EXECARGV),
      'process.env.EXODUS_TEST_ONLY': stringify(process.env.EXODUS_TEST_ONLY),
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
      EXODUS_TEST_FILES: stringify(files.map((f) => [dirname(f), basename(f)])),
      EXODUS_TEST_SNAPSHOTS: stringify(EXODUS_TEST_SNAPSHOTS),
      EXODUS_TEST_RECORDINGS: stringify(EXODUS_TEST_RECORDINGS),
      EXODUS_TEST_FSFILES: stringify(fsfiles), // TODO: can we safely use relative paths?
    },
    alias: {
      // Jest, tape and node:test
      '@jest/globals': resolveImport('../src/jest.js'),
      tape: resolveImport('../src/tape.cjs'),
      'tape-promise/tape': resolveImport('../src/tape.cjs'),
      'node:test': resolveImport('../src/node.js'),
      // Inner
      'exodus-test:util-format': api('util-format.cjs'),
      // Node.js (except node:test)
      ...Object.fromEntries(Object.entries(nodeUnprefixed).map(([k, v]) => [`node:${k}`, v])),
      ...nodeUnprefixed,
      'node:url': api('url.cjs'), // FIXME: load this under 'url' too
      // expect-related deps
      'ansi-styles': api('ansi-styles.cjs'),
      'jest-util': api('jest-util.js'),
      'jest-message-util': api('jest-message-util.js'),
      // unwanted deps
      bindings: api('empty/function-throw.cjs'),
      'node-gyp-build': api('empty/function-throw.cjs'),
      ws: api('ws.cjs'),
    },
    sourcemap: ['hermes', 'jsc', 'd8'].includes(options.platform) ? 'inline' : 'linked', // FIXME?
    sourcesContent: false,
    keepNames: true,
    format: 'iife',
    target: options.target || `node${process.versions.node}`,
    supported: {
      bigint: true,
      ...(options.platform === 'hermes' ? hermesSupported : {}),
    },
    plugins: [
      {
        name: 'exodus-test.bundle',
        setup({ onLoad }) {
          onLoad({ filter: /\.[cm]?[jt]sx?$/, namespace: 'file' }, async (args) => {
            let filepath = args.path
            // Resolve .native versions
            // TODO: move flag to engine options
            // TODO: maybe follow package.json for this
            if (['jsc', 'hermes'].includes(options.platform)) {
              const maybeNative = filepath.replace(/(\.[cm]?[jt]sx?)$/u, '.native$1')
              if (existsSync(maybeNative)) filepath = maybeNative
            }

            const loader = extname(filepath).replace(/^\.[cm]?/, '') // TODO: a flag to force jsx/tsx perhaps
            assert(['js', 'ts', 'jsx', 'tx'].includes(loader))

            return { contents: await loadSourceFile(filepath), loader }
          })
        },
      },
    ],
  })
  assert.equal(res instanceof Error, res.errors.length > 0)

  // if (res.errors.length === 0) require('fs').copyFileSync(outfile, 'tempout.cjs') // DEBUG

  // We treat warnings as errors, so just merge all them
  const errors = []
  const formatOpts = { color: process.stdout.hasColors?.(), terminalWidth: process.stdout.columns }
  const formatMessages = (list, kind) => esbuild.formatMessages(list, { kind, ...formatOpts })
  if (res.warnings.length > 0) errors.push(...(await formatMessages(res.warnings, 'warning')))
  if (res.errors.length > 0) errors.push(...(await formatMessages(res.errors, 'error')))
  return { file: outfile, errors }
}
