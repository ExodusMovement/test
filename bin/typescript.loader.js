import { dirname, resolve as pathResolve } from 'node:path'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'

const require = createRequire(import.meta.url)
const amaroDir = dirname(require.resolve('amaro/package.json'))
const amaro = await import(pathResolve(amaroDir, 'dist/index.js'))
const extensionsRegex = /\.ts$|\.mts$/

export async function load(url, context, nextLoad) {
  if (extensionsRegex.test(url) && !url.includes('/node_modules/')) {
    const sourceBuf = await readFile(new URL(url))
    const source = sourceBuf.toString('utf8')
    const transformed = amaro.transformSync(source, { isModule: true }).code
    const transformedBuf = Buffer.from(transformed)
    if (sourceBuf.length !== transformed.length) throw new Error('length mismatch')
    // eslint-disable-next-line unicorn/no-for-loop
    for (let i = 0; i < transformedBuf.length; i++) {
      // should match either the source buffer or spaces
      const val = transformedBuf[i]
      if (val !== sourceBuf[i] && val !== 0x20) throw new Error('result mismatch')
    }

    return { format: 'module', source: transformed, shortCircuit: true }
  }

  return nextLoad(url, context)
}
