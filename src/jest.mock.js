import {
  mock,
  assert,
  baseFile,
  relativeRequire as require,
  isTopLevelESM,
  builtinModules,
  syncBuiltinESMExports,
} from './engine.js'
import { jestfn } from './jest.fn.js'
import { makeEsbuildMockable } from './dark.cjs'

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

export function resolveModule(name) {
  assert(baseFile || /^[@a-zA-Z]/u.test(name), 'Mocking relative paths is not possible')
  const unprefixed = name.replace(/^node:/, '')
  if (builtinModules.includes(unprefixed)) return unprefixed
  return require.resolve(name)
}

export function requireActual(name) {
  const resolved = resolveModule(name)
  if (mapActual.has(resolved)) return mapActual.get(resolved)
  if (!mapMocks.has(resolved)) return require(resolved)
  throw new Error('Module can not been loaded')
}

export function requireMock(name) {
  const resolved = resolveModule(name)
  assert(mapMocks.has(resolved), 'Module is not mocked')
  return mapMocks.get(resolved)
}

export function resetModules() {
  for (const [, ctx] of nodeMocks) {
    if (mock.module) ctx.restore()
  }

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

const isObject = (obj) => [Object.prototype, null].includes(Object.getPrototypeOf(obj))

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
      return { __esModule, ...mockClone({ default: def, ...rest }, cache) }
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
      for (const [name, desc] of Object.entries(Object.getOwnPropertyDescriptors(level))) {
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

export function jestmock(name, mocker, { override = false } = {}) {
  // Loaded ESM: isn't mocked
  // Loaded CJS: mocked via object overriding
  // Loaded built-ins: mocked via object overriding where possible
  // New CJS: mocked via mock.module + require.cache
  // New ESM: mocked via mock.module
  // New built-ins: mocked via mock.module

  const resolved = resolveModule(name)
  assert(!mapMocks.has(resolved), 'Re-mocking the same module is not supported')
  assert(
    !overridenBuiltins.has(resolved),
    'Built-in modules mocked with jest.mock can not be remocked, use jest.doMock'
  )

  // Attempt to load it
  // Jest also loads modules on mock
  // Can be ESM, so let it fail silently
  const havePrior = Object.hasOwn(require.cache, resolved)
  try {
    mapActual.set(resolved, require(resolved))
  } catch {}

  const value = mocker ? { ...mocker() } : mockClone(mapActual.get(resolved))
  mapMocks.set(resolved, value)

  let likelyESM = false
  const isBuiltIn = builtinModules.includes(resolved)
  const isNodeCache = (x) => x.id && x.path && x.filename && x.children && x.paths && x.loaded
  if (Object.hasOwn(require.cache, resolved)) {
    if (isNodeCache(require.cache[resolved]) || !require.cache[resolved].exports?.__esModule) {
      assert.equal(mapActual.get(resolved), require.cache[resolved].exports)
      // If we did't have this prior but have now, it means we just loaded it and there are no leaked instances
      if (havePrior && override) overrideModule(resolved)
      require.cache[resolved].exports = value
    } else {
      // If it's non-Node.js and has __esModule tag, assume it's ESM
      likelyESM = true
    }
  } else if (isBuiltIn) {
    if (override) {
      overridenBuiltins.add(resolved)
      overrideModule(resolved, true) // Override builtin modules
      syncBuiltinESMExports()
    }

    require.cache[resolved] = require.cache[`node:${resolved}`] = { exports: value }
  } else {
    // The module doesn't exist or is ESM
    likelyESM = true
  }

  if (likelyESM || (!isBuiltIn && isTopLevelESM())) {
    // Native module mocks is required if loading ESM or __from__ ESM
    // No good way to check the locations that import the module, but we can check top-level file
    // Built-in modules are fine though
    assert(mock.module, 'ESM module mocks are available only on Node.js >=22.3')
  } else if (isBuiltIn && name.startsWith('node:') && !override) {
    assert(mock.module, 'Native non-overriding node:* mocks are available only on Node.js >=22.3')
  }

  const obj = { defaultExport: value }
  if (likelyESM && isObject(value) && value.__esModule === true) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { default: defaultExport, __esModule, ...namedExports } = value
    Object.assign(obj, { defaultExport, namedExports })
  }

  nodeMocks.set(resolved, mock.module?.(resolved, obj))

  return this
}

makeEsbuildMockable()
