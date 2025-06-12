import { loadJestConfig, installJestEnvironment } from './jest.config.js'

export async function setupJest() {
  await loadJestConfig()
  const { should, ...jestGlobals } = await import('./jest.js') // eslint-disable-line @typescript-eslint/no-unused-vars
  await installJestEnvironment(jestGlobals)
}
