const config = {
  testMatch: [`**/?(*.)+(spec|test).?([cm])[jt]s?(x)`], // From bin/index.js defaults
  setupFiles: [
    '<rootDir>/tests/setup-files/setup.cjs',
    '<rootDir>/tests/setup-files/setup.mjs',
    '<rootDir>/tests/setup-files/setup.js',
  ],
}

export default config
