const config = {
  testMatch: [`**/?(*.)+(spec|test).?([cm])[jt]s?(x)`], // From bin/index.js defaults
  setupFiles: [
    '<rootDir>/tests/jest/setup.cjs',
    '<rootDir>/tests/jest/setup-files/setup.cjs',
    '<rootDir>/tests/jest/setup-files/setup.mjs',
    '<rootDir>/tests/jest/setup-files/setup.js',
  ],
}

export default config
