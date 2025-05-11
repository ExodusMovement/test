import {
  mock,
  assert,
  requireIsRelative,
  relativeRequire as require,
  isTopLevelESM,
  builtinModules,
  syncBuiltinESMExports,
} from './engine.js'
import { jestfn } from './jest.fn.js'
import { loadExpect } from './expect.cjs'
import { makeEsbuildMockable, insideEsbuild } from './dark.cjs'

const mapMocks = new Map()
const mapActual = new Map()
const nodeMocks = new Map()
const overridenBuiltins = new Set()

function wrap(impl) {
  return function (...args) {
    impl(...args)
    return this
  }
}

export const jestModuleMocks = {
  mock: wrap((name, mock) => jestmock(name, mock, { override: true })),
  doMock: wrap((name, mock) => jestmock(name, mock)),
  unmock: wrap(unmock),
  dontMock: wrap(unmock),
  createMockFromModule: (name) => mockClone(requireActual(name)),
  requireMock,
  requireActual,
  resetModules,
}

if (process.env.EXODUS_TEST_ENVIRONMENT === 'bundle') {
  globalThis.EXODUS_TEST_MOCK_BUILTINS = new Map()
  Object.assign(jestModuleMocks, {
    __mockBundle: wrap((name, builtin, actual, mock) =>
      jestmock(name, mock, { actual, builtin, override: true })
    ),
    __doMockBundle: wrap((name, builtin, actual, mock) =>
      jestmock(name, mock, { actual, builtin })
    ),
  })
}

// For bundles
const cjsSet = typeof __mocksCJSPossible === 'undefined' ? null : __mocksCJSPossible // eslint-disable-line no-undef
const esmSet = typeof __mocksESMPossible === 'undefined' ? null : __mocksESMPossible // eslint-disable-line no-undef

function resolveModule(name) {
  if (process.env.EXODUS_TEST_ENVIRONMENT === 'bundle') {
    assert(name.startsWith('bundle:'), `Can't mock unresolved ${name} in bundle, use static syntax`)
    assert(cjsSet && esmSet, 'Module mocking not installed correctly in bundle')
    const id = name.replace(/^bundle:/u, '')
    assert(!cjsSet?.has(id) || !esmSet?.has(id), 'CJS/ESM conflict in bundle mock')
    assert(cjsSet?.has(id) || esmSet?.has(id), `Mock: can not find ${id} in bundle. Unused mock?`)
    const cjs = `${id}.exodus-test-mock.cjs`
    if (esmSet.has(id) && cjsSet.has(cjs)) {
      assert(!esmSet.has(cjs))
      return cjs
    }

    return id
  }

  assert(requireIsRelative || /^[@a-zA-Z]/u.test(name), 'Mocking relative paths is not possible')
  const unprefixed = name.replace(/^node:/, '')
  if (builtinModules.includes(unprefixed)) return unprefixed
  return require.resolve(name)
}

function resolveImport(name) {
  try {
    const { fileURLToPath } = require('node:url')
    return fileURLToPath(import.meta.resolve(name))
  } catch {
    return null
  }
}

function requireActual(name) {
  const resolved = resolveModule(name)
  if (mapActual.has(resolved)) return mapActual.get(resolved)
  if (!mapMocks.has(resolved)) return require(resolved)
  throw new Error('Module can not been loaded')
}

function requireMock(name) {
  const resolved = resolveModule(name)
  assert(mapMocks.has(resolved), 'Module is not mocked')
  return mapMocks.get(resolved)
}

function resetModules() {
  for (const [, ctx] of nodeMocks) {
    if (mock.module) ctx.restore()
  }

  assert(process.env.EXODUS_TEST_ENVIRONMENT !== 'bundle', 'resetModules() unsupported from bundle')
  for (const resolved of Object.keys(require.cache)) {
    delete require.cache[resolved]
    mapMocks.delete(resolved)
  }
}

function unmock(name) {
  const resolved = resolveModule(name)
  assert(mapMocks.has(resolved), 'Module is not mocked')
  if (mock.module) nodeMocks.get(resolved).restore()
  delete require.cache[resolved]
  delete require.cache[`node:${resolved}`]
  mapMocks.delete(resolved)
  nodeMocks.delete(resolved)
  assert(
    !overridenBuiltins.has(resolved),
    'Built-in modules mocked with jest.mock can not be unmocked, use jest.doMock'
  )
}

const isObject = (obj) => obj && [Object.prototype, null].includes(Object.getPrototypeOf(obj))

function overrideModule(resolved, lax = false) {
  const value = mapMocks.get(resolved)
  const current = mapActual.get(resolved)
  if (current === value) return
  assert(isObject(value), 'Overriding loaded or internal modules is possible with objects only')
  const clone = { ...current }
  Object.setPrototypeOf(clone, Object.getPrototypeOf(current))
  mapActual.set(resolved, clone)
  for (const key of Object.keys(current)) {
    try {
      delete current[key]
    } catch {}
  }

  // We want to skip overriding frozen properties that already match, e.g. fs.constants
  const filtered = Object.entries(value).filter(([k, v]) => !(k in {}) && current[k] !== v)
  const access = { configurable: true, enumerable: true, writable: true }
  const definitions = Object.fromEntries(filtered.map(([k, value]) => [k, { value, ...access }]))
  Object.defineProperties(current, definitions)
  const proto = Object.getPrototypeOf(value)
  if (Object.getPrototypeOf(current) !== proto) Object.setPrototypeOf(current, proto)
  const checked = { ...current }
  // allow value.__esModule to be absent, allow value.__esModule to be non-enumerable
  // if we try to override an existing __esModule module with a manually passed obj, it means we are using named exports
  if (value.__esModule && current.__esModule === true) checked.__esModule = current.__esModule
  if (!lax) assert.deepEqual(checked, value)
}

function mockClone(obj, cache = new Map()) {
  if (!cache.has(obj)) cache.set(obj, mockCloneItem(obj, cache))
  return cache.get(obj)
}

function mockCloneItem(obj, cache) {
  if ([Object.prototype, null].includes(obj)) return obj
  if (!obj || ['number', 'boolean', 'string', 'bigint'].includes(typeof obj)) return obj
  const TypedArray = Object.getPrototypeOf(Int8Array)
  if (Array.isArray(obj) || obj instanceof TypedArray) return [] // this is what jest does apparently
  if (obj instanceof RegExp) return new RegExp() // this is what jest does apparently
  // eslint-disable-next-line no-new-wrappers, unicorn/new-for-builtins
  if (obj instanceof String) return new String(obj)
  if (obj instanceof Function) {
    const res = jestfn()
    cache.set(obj, res)
    if (obj.prototype) res.prototype = mockClone(obj.prototype, cache)
    return res
  }

  if (typeof obj === 'object') {
    // Special path, as .default might be a getter and we want to unwrap it
    if (obj.__esModule === true) {
      const { __esModule, default: def, ...rest } = obj
      const proto = Object.getPrototypeOf(obj)
      const toClone = proto?.[Symbol.toStringTag] === 'Module' ? proto : { default: def, ...rest } // unwrap bun modules for proper cloning
      return { __esModule, ...mockClone(toClone, cache) }
    }

    const prototype = Object.getPrototypeOf(obj)
    const clone = Object.create(prototype === null ? null : Object.prototype)
    cache.set(obj, clone)

    const definitions = []

    // Collect all property descriptors from the prototype chain, top-level last for correct overriding in fromEntries
    const stack = []
    for (let c = obj; c && c !== Object.prototype; c = Object.getPrototypeOf(c)) stack.unshift(c)
    let modified = stack.length > 1
    for (const level of stack) {
      const descriptors = Object.getOwnPropertyDescriptors(level)
      const entries = Object.entries(descriptors)
      for (const sym of [Symbol.toStringTag]) {
        if (sym && Object.hasOwn(descriptors, sym)) entries.push([sym, descriptors[sym]]) // Missed by Object.entries
      }

      for (const [name, desc] of entries) {
        if (name === 'constructor') continue

        for (const key of ['get', 'set', 'value']) {
          if (!desc[key]) continue
          const orig = desc[key]
          desc[key] = mockClone(desc[key], cache)
          if (orig !== desc[key]) modified = true
        }

        desc.enumerable = desc.configurable = true
        if (desc.value !== undefined || desc.get || desc.set) definitions.push([name, desc])
      }
    }

    Object.defineProperties(clone, Object.fromEntries(definitions))

    return modified ? clone : obj
  }

  return null
}

function jestmock(name, mocker, { override = false, actual, builtin } = {}) {
  // Loaded ESM: isn't mocked
  // Loaded CJS: mocked via object overriding
  // Loaded built-ins: mocked via object overriding where possible
  // New CJS, doMock CJS: mocked via mock.module + require.cache
  // New ESM, doMock ESM: mocked via mock.module
  // New built-ins: mocked via mock.module
  // [Bundled] New CJS, doMock CJS: mocked via bundle hook
  // [Bundled] New ESM, doMock ESM: isn't mocked
  // [Bundled] New built-ins: mocked via bundle hook

  const resolved = resolveModule(name)
  assert(!mapMocks.has(resolved), 'Re-mocking the same module is not supported')
  assert(
    !overridenBuiltins.has(resolved),
    'Built-in modules mocked with jest.mock can not be remocked, use jest.doMock'
  )

  let havePrior
  if (process.env.EXODUS_TEST_ENVIRONMENT === 'bundle') {
    havePrior = __mocksCJSLoaded.has(resolved) || __mocksESMLoaded.has(resolved) // eslint-disable-line no-undef
    assert(actual)
  } else {
    havePrior = Object.hasOwn(require.cache, resolved)
    assert(!actual && !builtin)
  }

  // Attempt to load it
  // Jest also loads modules on mock
  // Can be ESM, so let it fail silently
  try {
    assert(!resolved.endsWith('.exodus-test-mock.cjs')) // actual() would attempt to load non-wrapped ESM here
    mapActual.set(resolved, actual ? actual() : require(resolved))
  } catch {
    const reason = actual ? 'in bundle' : 'without --esbuild or newer Node.js'
    assert(mocker, `Can not auto-clone a native ESM module ${reason}`)
  }

  const expand = (obj) => (isObject(obj) ? { ...obj } : obj)
  const value = mocker ? expand(mocker()) : mockClone(mapActual.get(resolved))
  mapMocks.set(resolved, value)

  loadExpect('jest.mock') // we need to do this as we don't want mocks affecting expect

  if (process.env.EXODUS_TEST_ENVIRONMENT === 'bundle') {
    if (builtin) globalThis.EXODUS_TEST_MOCK_BUILTINS.set(builtin, value)
    if (havePrior && override) overrideModule(resolved) // This won't work on ESM

    if (cjsSet?.has(resolved)) {
      __mocksCJS.set(resolved, value) // eslint-disable-line no-undef
    } else if (esmSet?.has(resolved)) {
      throw new Error('ESM module mocks are not supported from bundle') // TODO: can we do something?
    } else {
      throw new Error('unreachable')
    }

    return this
  }

  const topLevelESM = isTopLevelESM()
  let likelyESM = topLevelESM && !insideEsbuild() && ![null, resolved].includes(resolveImport(name))
  let isOverridenBuiltinSynchedWithESM = false
  const isBuiltIn = builtinModules.includes(resolved)
  const isNodeCache = (x) => x && x.id && x.path && x.filename && x.children && x.paths && x.loaded
  if (isBuiltIn && !isNodeCache(require.cache[resolved])) {
    if (!value.default && !value.__esModule) {
      value.__esModule = true // allows esbuild to unwrap it to named mocks
      value.default = value
    }

    if (override) {
      overridenBuiltins.add(resolved)
      overrideModule(resolved, true) // Override builtin modules
      if (syncBuiltinESMExports) {
        syncBuiltinESMExports()
        isOverridenBuiltinSynchedWithESM = true
      }
    }

    require.cache[resolved] = require.cache[`node:${resolved}`] = { exports: value }
  } else if (Object.hasOwn(require.cache, resolved)) {
    if (isNodeCache(require.cache[resolved]) || !require.cache[resolved].exports?.__esModule) {
      const { exports } = require.cache[resolved]
      assert.equal(mapActual.get(resolved), exports)
      if (exports?.[Symbol.toStringTag] === 'Module') likelyESM = true // required ESM in Node.js
      // If we did't have this prior but have now, it means we just loaded it and there are no leaked instances
      if (havePrior && override) overrideModule(resolved)
      require.cache[resolved].exports = value
    } else {
      // If it's non-Node.js and has __esModule tag, assume it's ESM
      likelyESM = true
    }
  } else {
    // The module doesn't exist or is ESM
    likelyESM = true
  }

  const mocksNodeVersionNote = 'mocks are available only on Node.js >=20.18 <21 || >=22.3'
  if (likelyESM || (!isOverridenBuiltinSynchedWithESM && topLevelESM)) {
    // Native module mocks is required if loading ESM or __from__ ESM
    // No good way to check the locations that import the module, but we can check top-level file
    // Built-in modules are fine though
    assert(mock.module, `ESM module ${mocksNodeVersionNote}`)
  } else if (isBuiltIn && name.startsWith('node:') && !override) {
    assert(mock.module, `Native non-overriding node:* ${mocksNodeVersionNote}`)
  }

  if (value[Symbol.toStringTag] === 'Module') value.__esModule = true
  const obj = { defaultExport: value }
  if (isBuiltIn && isObject(value)) obj.namedExports = value
  if (insideEsbuild()) {
    // esbuild handles unwrapping just default exports for us
    assert(!likelyESM) // should not be reachable
    const { default: defaultExport, __esModule, ...namedExports } = value // eslint-disable-line @typescript-eslint/no-unused-vars
    // Don't override defaultExport, as that's processed with esbuild
    // Add named exports though for further static named imports from that module
    // type:module and esbuild can be combined e.g. when testing typescript packages
    if (__esModule) obj.namedExports = namedExports
  } else if (likelyESM && isObject(value) && value.__esModule === true) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { default: defaultExport, __esModule, ...namedExports } = value
    Object.assign(obj, { defaultExport, namedExports })
    if (obj.defaultExport === undefined) delete obj.defaultExport
  }

  nodeMocks.set(resolved, mock.module?.(resolved, obj))

  return this
}

makeEsbuildMockable()
