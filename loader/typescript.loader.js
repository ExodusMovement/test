import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module' // 22.13.0+
import { fileURLToPath } from 'node:url'

const extensionsRegex = /\.[cm]?ts$/

function shouldProcessUrl(s) {
  if (!s.startsWith('file://') || !s.includes('ts') || s.includes('/node_modules/')) return false
  try {
    return extensionsRegex.test(fileURLToPath(s))
  } catch {
    return false
  }
}

const { URL, Buffer } = globalThis

export async function load(url, context, nextLoad) {
  if (shouldProcessUrl(url)) {
    const sourceBuf = await readFile(new URL(url))
    const source = sourceBuf.toString('utf8')
    const transformed = stripTypeScriptTypes(source, { mode: 'strip' })
    const transformedBuf = Buffer.from(transformed)
    if (sourceBuf.length !== transformedBuf.length) throw new Error('length mismatch')
    // eslint-disable-next-line unicorn/no-for-loop
    for (let i = 0; i < transformedBuf.length; i++) {
      // should match either the source buffer or spaces or semicolon: https://github.com/swc-project/swc/issues/9331
      const val = transformedBuf[i]
      if (val !== sourceBuf[i] && val !== 0x20 && val !== 0x3b) throw new Error('result mismatch')
    }

    return { format: 'module', source: transformed, shortCircuit: true }
  }

  return nextLoad(url, context)
}
