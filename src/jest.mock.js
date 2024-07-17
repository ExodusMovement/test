import assert from 'node:assert/strict'
import { createRequire, builtinModules, syncBuiltinESMExports } from 'node:module'
import { existsSync } from 'node:fs'
import { normalize } from 'node:path'
import { mock } from 'node:test'
import { jestfn } from './jest.fn.js'

const files = process.argv.slice(1)
const baseUrl = files.length === 1 && existsSync(files[0]) ? normalize(files[0]) : undefined
const mapMocks = new Map()
const mapActual = new Map()

const require = createRequire(baseUrl || import.meta.url)

export const relativeRequire = require

export function resolveModule(name) {
  assert(baseUrl || /^[@a-zA-Z]/u.test(name), 'Mocking relative paths is not possible')
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
  // Caveat: only resets CJS modules, not ESM
  for (const key of Object.keys(require.cache)) delete require.cache[key]
}

const isObject = (obj) => [Object.prototype, null].includes(Object.getPrototypeOf(obj))

function override(resolved, lax = false) {
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
  if (!lax) assert.deepEqual({ ...current }, value)
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

export function jestmock(name, mocker) {
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

  if (Object.hasOwn(require.cache, resolved)) {
    assert.equal(mapActual.get(resolved), require.cache[resolved].exports)
    // If we did't have this prior but have now, it means we just loaded it and there are no leaked instances
    if (havePrior) override(resolved)
    require.cache[resolved].exports = value
  } else if (builtinModules.includes(resolved)) {
    override(resolved, true) // Override builtin modules
    syncBuiltinESMExports()
  } else {
    // The module doesn't exist or is ESM
    assert(mock.module, 'ESM module mocks are available only on Node.js >=22.3')
  }

  mock.module?.(resolved, {
    defaultExport: value.default ?? value,
    namedExports: isObject(value) ? value : {},
  })

  return this
}
