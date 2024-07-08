import assert from 'node:assert/strict'
import { createRequire, builtinModules } from 'node:module'
import { mock } from 'node:test'

const require = createRequire(import.meta.url)
const mapMocks = new Map()
const mapActual = new Map() // mapActual keys are always a subset of mapMocks keys

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

function override(resolved, value, lax = false) {
  const current = mapActual.get(resolved)
  const isObject = current && [Object.prototype, null].includes(Object.getPrototypeOf(current))
  assert(isObject, 'Modules that export a default non-object can not be mocked')
  mapActual.set(resolved, { ...current })
  for (const key of Object.keys(current)) {
    try {
      delete current[key]
    } catch {}
  }

  Object.assign(current, value)
  if (!lax) assert.deepEqual({ ...current }, value)
}

export function jestmock(name, mocker) {
  assert(mocker, 'Non-partial module mocks are not implemented yet')
  assert(mock.module, 'ESM module mocks are available only on Node.js >=22.3')
  const value = { ...mocker() }

  // Loaded ESM: isn't mocked
  // Loaded CJS: mocked via object overriding
  // Loaded built-ins: not mocked for now (!!!)
  // New CJS: mocked via mock.module + require.cache
  // New ESM: mocked via mock.module
  // New built-ins: mocked via mock.module

  const resolved = resolveModule(name)
  assert(!mapMocks.has(resolved), 'Re-mocking the same module is not supported')
  mapMocks.set(resolved, value)

  // Attempt to load it
  // Jest also loads modules on mock
  // Can be ESM, so let it fail silently
  const havePrior = Object.hasOwn(require.cache, resolved)
  try {
    mapActual.set(resolved, require(resolved))
  } catch {}

  // fall through when e.g. this module doesn't exist or is ESM
  if (Object.hasOwn(require.cache, resolved)) {
    assert.equal(mapActual.get(resolved), require.cache[resolved].exports)
    // If we did't have this prior but have now, it means we just loaded it and there are not leaked instances
    if (havePrior) override(resolved, value)
    require.cache[resolved].exports = value
  } else if (builtinModules.includes(resolved.replace(/^node:/, ''))) {
    override(resolved, value, true) // Override builtin modules
  }

  mock.module(name, {
    defaultExport: value.default,
    namedExports: value,
  })
}
