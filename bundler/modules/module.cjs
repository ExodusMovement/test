const ids = 'Module,SourceMap,builtinModules,findSourceMap,globalPaths,isBuiltin,runMain'.split(',')

const makeMethod = (key) => {
  // Not an arrow as there are classes that can be called with new
  return function () {
    throw new Error(`module.${key} unsupported in bundled mode`)
  }
}

const createRequire = (filename) => (file) => {
  const clean = file.replace(/^node:/, '')
  if (globalThis.EXODUS_TEST_MOCK_BUILTINS?.has(clean)) return EXODUS_TEST_MOCK_BUILTINS.get(clean) // eslint-disable-line no-undef
  throw new Error(`module.createRequire is unsupported in bundled mode (origin: ${filename})`)
}

module.exports = { ...Object.fromEntries(ids.map((key) => [key, makeMethod(key)])), createRequire }
