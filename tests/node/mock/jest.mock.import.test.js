import assert from 'node:assert/strict'
import { describe, test, mock } from 'node:test'

describe(
  'mocking a builtin module from esm',
  {
    skip: !mock.module,
  },
  () => {
    test('should do a mock, import', async () => {
      mock.module('node:fs', {
        defaultExport: { x: 20 },
        namedExports: { foo: 'mocked foo' },
      })

      const fs = await import('node:fs')
      assert.equal(fs.default.x, 20)
      assert.equal(fs.foo, 'mocked foo')
    })
  }
)

describe(
  'mocking a module from esm',
  {
    skip: !mock.module,
  },
  () => {
    test('should do a mock, import', async () => {
      mock.module('c8', {
        defaultExport: { x: 20 },
        namedExports: { foo: 'mocked foo' },
      })

      const fs = await import('c8') // eslint-disable-line @exodus/import/no-extraneous-dependencies
      assert.equal(fs.default.x, 20)
      assert.equal(fs.foo, 'mocked foo')
    })
  }
)
