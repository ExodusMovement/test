import { registerHooks } from 'node:module' // 22.15+
import { readFileSync } from 'node:fs'
import flowRemoveTypes from '@exodus/test-bundler/flow-remove-types'

const { URL } = globalThis

function load(url, context, nextLoad) {
  if (url.startsWith('file://')) {
    const source = readFileSync(new URL(url), 'utf8')
    if (source.includes('@flow')) {
      const stripped = flowRemoveTypes(source, { pretty: true }).toString()
      return { format: context.format || 'commonjs', source: stripped, shortCircuit: true }
    }
  }

  return nextLoad(url, context)
}

registerHooks({ load })
