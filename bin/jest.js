import { loadJestConfig, installJestEnvironment } from '../src/jest.config.js'

await loadJestConfig()
const jestGlobals = await import('../src/jest.js')
await installJestEnvironment(jestGlobals)
