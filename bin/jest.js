const { loadJestConfig, installJestEnvironment } = await import('../src/jest.config.js')
await loadJestConfig()
const jestGlobals = await import('../src/jest.js')
await installJestEnvironment(jestGlobals)
