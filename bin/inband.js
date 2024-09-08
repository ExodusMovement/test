import { resolve } from 'node:path'
import { describe } from '../src/engine.js'

const files = JSON.parse(process.env.EXODUS_TEST_INBAND)
if (!Array.isArray(files)) throw new Error('Unexpected')

for (const file of files.sort()) {
  await describe(`EXODUS_TEST_INBAND:${file}`, async () => {
    await import(resolve(file))
  })
}
