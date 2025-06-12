import { registerHooks } from 'node:module' // 22.15+
import { readFileSync } from 'node:fs'
import flowRemoveTypes from '@exodus/test-bundler/flow-remove-types'
import { transformSync } from '@exodus/test-bundler/esbuild'

const { URL } = globalThis

const esbuildOptions = { platform: 'node', loader: 'jsx', format: 'cjs' }

function load(url, context, nextLoad) {
  if (url.startsWith('file://')) {
    const source = readFileSync(new URL(url), 'utf8')
    if (source.includes('@flow')) {
      let transformed = flowRemoveTypes(source, { pretty: true }).toString()
      // TODO: perhaps transform more code?
      if (url.includes('/node_modules/react-native/')) {
        transformed = transformSync(transformed, esbuildOptions).code
      }

      return { format: context.format || 'commonjs', source: transformed, shortCircuit: true }
    }
  }

  return nextLoad(url, context)
}

registerHooks({ load })
