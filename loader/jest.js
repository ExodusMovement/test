const { loadJestConfig, installJestEnvironment } = await import('../src/jest.config.js')
await loadJestConfig()
const { should, ...jestGlobals } = await import('../src/jest.js') // eslint-disable-line @typescript-eslint/no-unused-vars
await installJestEnvironment(jestGlobals)
