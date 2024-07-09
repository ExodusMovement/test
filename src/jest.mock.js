import assert from 'node:assert/strict'
import { createRequire, builtinModules } from 'node:module'
import { mock } from 'node:test'
import { jestfn } from './jest.fn.js'

const require = createRequire(import.meta.url)
const mapMocks = new Map()
const mapActual = new Map()

function resolveModule(name) {
  assert(/^[@a-zA-Z]/u.test(name), 'Mocking relative paths is not supported')
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

const isObject = (obj) => [Object.prototype, null].includes(Object.getPrototypeOf(obj))

function override(resolved, lax = false) {
  const value = mapMocks.get(resolved)
  const current = mapActual.get(resolved)
  assert(isObject(current), 'Modules that export a default non-object can not be mocked')
  assert(isObject(value), 'Overriding loaded or internal modules is possible with objects only')
  mapActual.set(resolved, { ...current })
  for (const key of Object.keys(current)) {
    try {
      delete current[key]
    } catch {}
  }

  // We want to skip overriding frozen properties that already match, e.g. fs.constants
  const filtered = Object.entries(value).filter(([k, v]) => !(k in {}) && current[k] !== v)
  Object.assign(current, Object.fromEntries(filtered))
  if (!lax) assert.deepEqual({ ...current }, value)
}

function mockClone(root) {
  assert(isObject(root), 'Can not do a full mock on a non-object module')
  const seen = new Map()
  const simple = new Set()
  const TypedArray = Object.getPrototypeOf(Int8Array)
  const walk = (obj) => {
    if (!obj || ['number', 'boolean', 'string', 'bigint'].includes(typeof obj)) return [obj, false]
    if (Array.isArray(obj) || obj instanceof TypedArray) return [[], false] // this is what jest does apparently
    if (obj instanceof RegExp) return [new RegExp(), false] // this is what jest does apparently
    if (seen.has(obj)) return [seen.get(obj), !simple.has(obj)]
    if (obj instanceof Function) {
      seen.set(obj, jestfn(obj))
      return [seen.get(obj), true]
    }

    if (isObject(obj)) {
      const clone = Object.create(Object.getPrototypeOf(obj))
      seen.set(obj, clone)
      let modified = false
      for (const [k, v] of Object.entries(obj)) {
        const res = walk(v)
        if (!res && !(k in clone)) continue
        clone[k] = res[0]
        modified ||= res[1]
      }

      if (modified) simple.add(obj)
      return [modified ? clone : obj, modified]
    }

    return null
  }

  return walk(root)[0]
}

export function jestmock(name, mocker) {
  assert(mock.module, 'ESM module mocks are available only on Node.js >=22.3')

  // Loaded ESM: isn't mocked
  // Loaded CJS: mocked via object overriding
  // Loaded built-ins: mocked via object overriding where possible
  // New CJS: mocked via mock.module + require.cache
  // New ESM: mocked via mock.module
  // New built-ins: mocked via mock.module

  const resolved = resolveModule(name)
  assert(!mapMocks.has(resolved), 'Re-mocking the same module is not supported')

  // Attempt to load it
  // Jest also loads modules on mock
  // Can be ESM, so let it fail silently
  const havePrior = Object.hasOwn(require.cache, resolved)
  try {
    mapActual.set(resolved, require(resolved))
  } catch {}

  const value = mocker ? { ...mocker() } : mockClone(mapActual.get(resolved))
  mapMocks.set(resolved, value)

  // fall through when e.g. this module doesn't exist or is ESM
  if (Object.hasOwn(require.cache, resolved)) {
    assert.equal(mapActual.get(resolved), require.cache[resolved].exports)
    // If we did't have this prior but have now, it means we just loaded it and there are not leaked instances
    if (havePrior) override(resolved)
    require.cache[resolved].exports = value
  } else if (builtinModules.includes(resolved.replace(/^node:/, ''))) {
    override(resolved, true) // Override builtin modules
  }

  mock.module(name, {
    defaultExport: value.default,
    namedExports: value,
  })
}
