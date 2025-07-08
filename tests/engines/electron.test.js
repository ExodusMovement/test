import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

describe(
  'Electron',
  {
    skip: !globalThis.process,
  },
  () => {
    const shouldBeElectron = process.env.EXODUS_TEST_PLATFORM === 'electron'

    test('Are we Electron', () => {
      assert.equal(Boolean(globalThis.process?.versions.electron), shouldBeElectron)
    })

    test('Do we have Chrome', () => {
      assert.equal(Boolean(globalThis.process?.versions.chrome), shouldBeElectron)
    })

    test('Are we on BoringSSL', async () => {
      const crypto = await import('node:crypto')
      const hashes = crypto.getHashes()
      assert.ok(hashes.includes('sha512'))
      if (shouldBeElectron) assert.ok(!hashes.includes('sha3-512'))
    })
  }
)
