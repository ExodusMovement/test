import assert from 'node:assert/strict'
import { readFile, writeFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { basename, dirname, extname, resolve, join, relative } from 'node:path'
import { createRequire } from 'node:module'
import { randomUUID as uuid, randomBytes } from 'node:crypto'
import * as esbuild from 'esbuild'
import glob from 'fast-glob'

const require = createRequire(import.meta.url)
const resolveRequire = (query) => require.resolve(query)
const resolveImport = import.meta.resolve && ((query) => fileURLToPath(import.meta.resolve(query)))
const cjsMockRegex = /\.exodus-test-mock\.cjs$/u
const cjsMockFallback = `throw new Error('Mocking loaded ESM modules in not possible in bundles')`

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

const stringify = (x) => ([undefined, null].includes(x) ? `${x}` : JSON.stringify(x))
const loadPipeline = [
  function (source, filepath) {
    let res = source
      .replace(/\bimport\.meta\.url\b/g, JSON.stringify(pathToFileURL(filepath)))
      .replace(/\b(__dirname|import\.meta\.dirname)\b/g, JSON.stringify(dirname(filepath)))
      .replace(/\b(__filename|import\.meta\.filename)\b/g, JSON.stringify(filepath))

    // Unneded polyfills
    for (const [a, b] of Object.entries({
      'is-nan': 'Number.isNaN', // https://www.npmjs.com/package/is-nan description: ES2015-compliant shim for Number.isNaN
      'is-nan/polyfill': '() => Number.isNaN',
      'object.assign': 'Object.assign',
      'object.assign/polyfill': '() => Object.assign',
      'object-is': 'Object.is',
      'object-is/polyfill': '() => Object.is',
      hasown: 'Object.hasOwn',
      gopd: 'Object.getOwnPropertyDescriptor',
      'has-property-descriptors': '() => true',
      'has-symbols': '() => true',
      'has-symbols/shams': '() => true',
      'has-tostringtag': "() => typeof Symbol.toStringTag === 'symbol'",
      'has-tostringtag/shams': '() => !!Symbol.toStringTag',
      'es-define-property': 'Object.defineProperty',
      'es-errors': 'Error',
      'es-errors/eval': 'EvalError',
      'es-errors/range': 'RangeError',
      'es-errors/ref': 'ReferenceError',
      'es-errors/syntax': 'SyntaxError',
      'es-errors/type': 'TypeError',
      'es-errors/uri': 'URIError',
    })) {
      res = res.replaceAll(`require('${a}')`, `(${b})`).replaceAll(`require("${a}")`, `(${b})`) // Assumes well-formed names/code
    }

    return res
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
const loadSourceFileBase = async (filepath) => {
  if (!loadCache.has(filepath)) {
    const load = async () => {
      let contents = await readFile(filepath.replace(cjsMockRegex, ''), 'utf8')
      for (const transform of loadPipeline) contents = await transform(contents, filepath)
      return contents
    }

    loadCache.set(filepath, load())
  }

  return loadCache.get(filepath)
}

export const build = async (...files) => {
  const envOverride = { FORCE_COLOR: '0', NO_COLOR: '1' }
  const getEnv = (key) => (Object.hasOwn(envOverride, key) ? envOverride[key] : process.env[key]) // We know key is safe as it comes from regex below
  const specificLoadPipeline = [
    (src) => src.replace(/\b(?:process\.env\.([A-Z0-9_]+))\b/gu, (_, x) => stringify(getEnv(x))),
  ]
  const loadSourceFile = async (filepath) => {
    let contents = await loadSourceFileBase(filepath)
    for (const transform of specificLoadPipeline) contents = await transform(contents, filepath)
    return contents
  }

  const input = []
  const importSource = async (file) => input.push(await loadSourceFile(resolveRequire(file)))
  const importFile = (...args) => input.push(`await import(${JSON.stringify(resolve(...args))});`)

  if (!['node', 'electron'].includes(options.platform)) {
    if (process.env.EXODUS_TEST_IS_BAREBONE) {
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
  const exit = `EXODUS_TEST_PROCESS.exitCode = 1; EXODUS_TEST_PROCESS._maybeProcessExitCode();`
  if (process.env.EXODUS_TEST_IS_BAREBONE) {
    main = `try {\n${main}\n} catch (err) { print(err); ${exit} }`
  } else if (process.env.EXODUS_TEST_IS_BROWSER) {
    main = `try {\n${main}\n} catch (err) { console.error(err); ${exit} }`
  }

  const fsfiles = await getPackageFiles(filename ? dirname(resolve(filename)) : process.cwd())
  const fsFilesContents = new Map()
  const fsFilesDirs = new Map()
  const cwd = process.cwd()
  const fixturesRegex = /(fixtures|samples|vectors|wycheproof)/u
  const aggressiveExtensions = /\.(json|txt|hex|wasm)$/u // These are bundled when just used in path.join and by wildcard from fixtures/
  const fileAllowed = (f) =>
    f && f.startsWith(`${cwd}/`) && resolve(f) === f && /^[a-z0-9@_./-]+$/iu.test(relative(cwd, f))

  const fsFilesAdd = async (file) => {
    if (!fileAllowed(file)) return
    try {
      const data = await readFile(file, 'base64')
      if (fsFilesContents.has(file)) {
        assert(fsFilesContents.get(file) === data)
      } else {
        fsFilesContents.set(file, data)
      }
    } catch (e) {
      if (e.code !== 'ENOENT') throw e
    }
  }

  const fixturesSeen = { fs: false, fixtures: false, bundled: false }
  const fsFilesBundleFixtures = async (reason) => {
    if (fixturesSeen.bundled || !filename) return
    if (reason === 'fs' || reason === 'fixtures') fixturesSeen[reason] = true
    if (!fixturesSeen.fs || !fixturesSeen.fixtures) return
    fixturesSeen.bundled = true
    const dir = dirname(resolve(filename))
    for (const name of await readdir(dir, { recursive: true })) {
      const parent = dirname(name)
      if (!fixturesRegex.test(parent)) continue // relative dir path should look like a fixtures dir

      // Save as directory entry into parent dir
      const subdir = resolve(dir, parent)
      if (fileAllowed(subdir)) {
        if (!fsFilesDirs.has(subdir)) fsFilesDirs.set(subdir, [])
        fsFilesDirs.get(subdir).push(basename(name))
      }

      // Save to files
      const file = resolve(dir, name)
      if (aggressiveExtensions.test(file)) await fsFilesAdd(file)
    }
  }

  specificLoadPipeline.push(async (source, filepath) => {
    for (const m of source.matchAll(/readFileSync\(\s*(?:"([^"\\]+)"|'([^'\\]+)')[),]/gu)) {
      await fsFilesAdd(resolve(m[1] || m[2])) // resolves from cwd
    }

    // E.g. path.join(import.meta.dirname, './fixtures/data.json'), dirname is inlined by loadPipeline already
    const dir = dirname(filepath)
    for (const m of source.matchAll(/join\(\s*("[^"\\]+"),\s*(?:"([^"\\]+)"|'([^'\\]+)')\s*\)/gu)) {
      if (m[1] !== JSON.stringify(dir)) continue // only allow files relative to dirname, from loadPipeline
      const file = resolve(dir, m[2] || m[3])
      if (aggressiveExtensions.test(file)) await fsFilesAdd(file) // only bundle path.join for specific extensions used as test fixtures
    }

    // Both conditions should happen for deep fixtures inclusion
    if (/(readdir|readFile|exists)Sync/u.test(source)) await fsFilesBundleFixtures('fs')
    if (fixturesRegex.test(source)) await fsFilesBundleFixtures('fixtures')

    // Resolve require.resolve and bundle those files for fixture or json extensions (e.g. package.json)
    let filepathRequire
    const toAdd = []
    const res = source.replace(
      /\b(require|import\.meta)\.resolve\(\s*(?:"([^"\\]+)"|'([^'\\]+)')\s*\)/gu,
      (orig, cause, a, b) => {
        if (!filepathRequire) filepathRequire = createRequire(filepath)
        try {
          const file = filepathRequire.resolve(a || b)
          if (aggressiveExtensions.test(file)) toAdd.push(file) // load resolved files for specific extensions
          if (cause === 'require') return `(${stringify(file)})`
          // Do not replace import.meta.resolve for non-fixture extensions, might cause misresolutions
          return aggressiveExtensions.test(file) ? `(${stringify(pathToFileURL(file))})` : orig
        } catch {
          return orig
        }
      }
    )

    for (const file of toAdd) await fsFilesAdd(file)

    return res
  })

  if (files.length === 1) {
    const main = resolve(files[0])
    specificLoadPipeline.push((source, filepath) => {
      return source.replaceAll('(require.main === module)', `(${filepath === main})`)
    })
  }

  const hasBuffer = ['node', 'bun', 'electron'].includes(options.platform)
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
    module: api('module.cjs'),
    os: resolveRequire('os-browserify/browser.js'), // 'main' entry point is noop, we want browser entry
    path: resolveRequire('path-browserify'),
    querystring: resolveRequire('querystring-es3'),
    stream: resolveRequire('stream-browserify'),
    timers: resolveRequire('timers-browserify'),
    tty: api('tty.cjs'),
    url: api('url.cjs'),
    util: api('util.cjs'),
    zlib: resolveRequire('browserify-zlib'),
  }

  const config = {
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
      'process.browser': stringify(true),
      'process.emitWarning': 'undefined',
      'process.stderr': 'undefined',
      'process.stdout': 'undefined',
      'process.type': 'undefined',
      'process.platform': 'undefined',
      'process.version': stringify('v22.5.1'), // shouldn't depend on currently used Node.js version
      'process.versions.node': stringify('22.5.1'), // see line above
      EXODUS_TEST_PROCESS_CWD: stringify(process.cwd()),
      EXODUS_TEST_FILES: stringify(files.map((f) => [dirname(f), basename(f)])),
      EXODUS_TEST_SNAPSHOTS: stringify(EXODUS_TEST_SNAPSHOTS),
      EXODUS_TEST_RECORDINGS: stringify(EXODUS_TEST_RECORDINGS),
      EXODUS_TEST_FSFILES: stringify(fsfiles), // TODO: can we safely use relative paths?
      EXODUS_TEST_FSFILES_CONTENTS: stringify([...fsFilesContents.entries()]),
      EXODUS_TEST_FSDIRS: stringify([...fsFilesDirs.entries()]),
    },
    alias: {
      // Jest, tape and node:test
      '@jest/globals': resolveImport('../src/jest.js'),
      tape: resolveImport('../src/tape.cjs'),
      'tape-promise/tape': resolveImport('../src/tape.cjs'),
      'node:test': resolveImport('../src/node.js'),
      'micro-should': resolveImport('../src/jest.js'),
      // Inner
      'exodus-test:text-encoding-utf': api('text-encoding-utf.cjs'),
      'exodus-test:util-format': api('util-format.cjs'),
      // Node.js (except node:test)
      ...Object.fromEntries(Object.entries(nodeUnprefixed).map(([k, v]) => [`node:${k}`, v])),
      ...nodeUnprefixed,
      // Needed for polyfills but name conflicts with Node.js modules
      'url/url.js': resolveRequire('url/url.js'),
      'util/util.js': resolveRequire('util/util.js'),
      // expect-related deps
      'ansi-styles': api('ansi-styles.cjs'),
      'jest-util': api('jest-util.js'),
      'jest-message-util': api('jest-message-util.js'),
      // unwanted deps
      bindings: api('empty/function-throw.cjs'),
      'node-gyp-build': api('empty/function-throw.cjs'),
      ws: api('ws.cjs'),
    },
    sourcemap: process.env.EXODUS_TEST_IS_BAREBONE ? 'inline' : 'linked', // FIXME?
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
        setup({ onResolve, onLoad }) {
          onResolve({ filter: /\.[cm]?[jt]sx?$/ }, (args) => {
            if (shouldInstallMocks && cjsMockRegex.test(args.path)) {
              return { path: args.path, namespace: 'file' }
            }
          })
          onLoad({ filter: /\.[cm]?[jt]sx?$/, namespace: 'file' }, async (args) => {
            let filepath = args.path
            // Resolve .native versions
            // TODO: maybe follow package.json for this
            if (process.env.EXODUS_TEST_IS_BAREBONE) {
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
  }

  let shouldInstallMocks = false
  const mocked = new Set()
  specificLoadPipeline.push(async (source, filepath) => {
    if (shouldInstallMocks) {
      if (cjsMockRegex.test(filepath)) return cjsMockFallback
      if (mocked.has(filepath) && !filepath.endsWith('.cjs') && /^export\b/mu.test(source)) {
        const mock = stringify(`${filepath}.exodus-test-mock.cjs`)
        const def = 'x.__esModule ? x.default : (x.default ?? x)'
        return `export * from ${mock}\nvar x = require(${mock})\nexport default ${def}`
      }
    }

    // 'await import' is replaced only in files with mocks (likely toplevel there)
    // Otherwise we don't patch module system at all
    if (!source.includes('jest.doMock') && !source.includes('jest.mock')) return source
    shouldInstallMocks = true
    const filepathRequire = createRequire(filepath)
    return source
      .replaceAll(/\bawait (import\((?:"[^"\\]+"|'[^'\\]+')\))/gu, 'EXODUS_TEST_SYNC_IMPORT($1)')
      .replaceAll(
        /\bjest\.(doMock|mock|requireActual|requireMock)\(\s*("[^"\\]+"|'[^'\\]+')/gu,
        (_, method, raw) => {
          try {
            const arg = JSON.parse(raw[0] === "'" ? raw.replaceAll("'", '"') : raw) // fine because it doesn't have quotes or \
            const { alias } = config
            const file = Object.hasOwn(alias, arg) ? alias[arg] : filepathRequire.resolve(arg) // throws when not resolved
            assert(existsSync(file), `File ${file} does not exist`)
            const builtin = stringify(Object.hasOwn(alias, arg) ? arg.replace(/^node:/, '') : null)
            const id = `bundle:${relative(cwd, file)}`
            if (method.startsWith('require')) return `jest.${method}(${stringify(id)}`
            mocked.add(file)
            return `jest.__${method}Bundle(${stringify(id)},${builtin},()=>require(${raw})`
          } catch (err) {
            console.error(err)
            throw new Error(`Failed to mock ${raw}: not resolved`, { cause: err })
          }
        }
      )
  })

  if (files.length === 1) {
    config.define['process.argv'] = stringify(['exodus-test', resolve(files[0])])
  }

  if (!['node', 'bun', 'electron'].includes(options.platform)) {
    config.define['process.cwd'] = 'EXODUS_TEST_PROCESS.cwd'
    config.define['process.exit'] = 'EXODUS_TEST_PROCESS.exit'
  }

  let res = await buildWrap(config)
  assert.equal(res instanceof Error, res.errors.length > 0)

  if (fsFilesContents.size > 0 || fsFilesDirs.size > 0) {
    // re-run as we detected that tests depend on fsReadFileSync contents
    config.define.EXODUS_TEST_FSFILES_CONTENTS = stringify([...fsFilesContents.entries()])
    config.define.EXODUS_TEST_FSDIRS = stringify([...fsFilesDirs.entries()])
    res = await buildWrap(config)
    assert.equal(res instanceof Error, res.errors.length > 0)
  }

  if (res.errors.length === 0 && shouldInstallMocks) {
    const code = await readFile(outfile, 'utf8')
    const heads = {
      esm: /(var __esm = (?:function)?\((fn[\d]*), res[\d]*\)\s*(?:=>|\{\s*return)\s*)(function __init[\d]*\(\) \{)/u,
      cjs: /(var __commonJS = (?:function)?\((cb[\d]*), mod[\d]*\)\s*(?:=>|\{\s*return)\s*)(function __require[\d]*\(\) \{)/u,
    }
    const k = '__getOwnPropNames($2)[0]'
    const mock = (p, l, v) =>
      `var ${p}=new Set(),${l}=new Set(),${v}=new Map();$1${p}.add(${k}) && $3;{const k=${k};${l}.add(k);if (${v}.has(k))return ${v}.get(k)};`
    assert(heads.esm.test(code) && heads.cjs.test(code), 'Failed to match for module mocks')
    const patched = code
      .replace(heads.esm, mock('__mocksESMPossible', '__mocksESMLoaded', '__mocksESM')) // __mocksESM actually doesn't work
      .replace(heads.cjs, mock('__mocksCJSPossible', '__mocksCJSLoaded', '__mocksCJS'))
      .replaceAll('EXODUS_TEST_SYNC_IMPORT(Promise.resolve().then(', '((f=>f())(')
    assert(!patched.includes('EXODUS_TEST_SYNC_IMPORT'), "Failed to fix 'await import'")
    await writeFile(outfile, patched)
  }

  // if (res.errors.length === 0) require('fs').copyFileSync(outfile, 'tempout.cjs') // DEBUG

  // We treat warnings as errors, so just merge all them
  const errors = []
  const formatOpts = { color: process.stdout.hasColors?.(), terminalWidth: process.stdout.columns }
  const formatMessages = (list, kind) => esbuild.formatMessages(list, { kind, ...formatOpts })
  if (res.warnings.length > 0) errors.push(...(await formatMessages(res.warnings, 'warning')))
  if (res.errors.length > 0) errors.push(...(await formatMessages(res.errors, 'error')))
  return { file: outfile, errors }
}
