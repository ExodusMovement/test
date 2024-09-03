const { Worker, MessageChannel, isMainThread, parentPort } = require('node:worker_threads')
const { once } = require('node:events')
const { availableParallelism } = require('node:os')

if (isMainThread) {
  const maxWorkers = availableParallelism() >= 4 ? 2 : 1
  const workers = []

  const getWorker = () => {
    const idle = workers.find((info) => info.busy === 0)
    if (idle) return idle

    if (workers.length < maxWorkers) {
      const worker = new Worker(__filename)
      worker.unref()
      // unhandled top-level errors will crash automatically, which is desired behavior, no need to listen to error
      workers.unshift({ worker, busy: 0 })
    } else if (workers.length > 1) {
      workers.sort((a, b) => a.busy - b.busy)
    }

    return workers[0]
  }

  const transformAsync = async (code, options) => {
    const info = getWorker()
    info.busy++
    const channel = new MessageChannel()
    info.worker.postMessage({ port: channel.port1, code, options }, [channel.port1])
    const [{ result, error }] = await once(channel.port2, 'message')
    info.busy--
    if (error) throw error
    return result
  }

  module.exports = { transformAsync }
} else {
  const babel = require('@babel/core')
  const tryLoadPlugin = (name) => {
    // Try unwrapping plugin names, as otherwise Babel tries to require them from the wrong dir,
    // which breaks strict directory structure under pnpm in some setups
    try {
      if (typeof name === 'string' && name.startsWith('@babel/plugin-')) return require(name)
    } catch {}

    return name
  }

  parentPort.on('message', ({ port, code: input, options }) => {
    try {
      // eslint-disable-next-line @exodus/mutable/no-param-reassign-prop-only
      if (options.plugins) options.plugins = options.plugins.map((name) => tryLoadPlugin(name))
      const { code, sourcetype, map } = babel.transformSync(input, options) // async here is useless and slower
      // additional properties are deleted as we don't want to transfer e.g. Plugin instances
      port.postMessage({ result: { code, sourcetype, map } })
    } catch (error) {
      port.postMessage({ error })
    }

    port.close()
  })
}
