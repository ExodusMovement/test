// Compatibility for running under Jest ESM
if (!globalThis.jest) {
  if (!process.env.NODE_OPTIONS?.includes('--experimental-vm-modules')) {
    throw new Error(
      'Our testsuite works under Jest only with NODE_OPTIONS=--experimental-vm-modules'
    )
  }

  const { jest } = require('@jest/globals')
  globalThis.jest = jest
}
