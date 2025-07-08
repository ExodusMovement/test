const describeNodeIntegration = globalThis.process ? describe : describe.skip
describeNodeIntegration('Electron', {}, () => {
  const shouldBeElectron = process.env.EXODUS_TEST_PLATFORM === 'electron'

  test('Are we Electron', () => {
    expect(Boolean(globalThis.process?.versions.electron)).toBe(shouldBeElectron)
  })

  test('Do we have Chrome', () => {
    expect(Boolean(globalThis.process?.versions.chrome)).toBe(shouldBeElectron)
  })

  test('Are we on BoringSSL', async () => {
    const crypto = await import('node:crypto')
    const hashes = crypto.getHashes()
    expect(hashes.includes('sha512')).toBe(true)
    if (shouldBeElectron) expect(hashes.includes('sha3-512')).toBe(false)
  })
})
