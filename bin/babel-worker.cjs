const { Worker, MessageChannel, isMainThread, parentPort } = require('node:worker_threads')
const { once } = require('node:events')

if (isMainThread) {
  const worker = new Worker(__filename)
  worker.unref()

  // unhandled top-level errors will crash automatically, which is desired behavior, no need to listen to error

  const transformAsync = async (code, options) => {
    const channel = new MessageChannel()
    worker.postMessage({ port: channel.port1, code, options }, [channel.port1])
    const [{ result, error }] = await once(channel.port2, 'message')
    if (error) throw error
    return result
  }

  module.exports = { transformAsync }
} else {
  const babel = require('@babel/core')
  parentPort.on('message', ({ port, code: input, options }) => {
    try {
      const { code, sourcetype, map } = babel.transformSync(input, options) // async here is useless and slower
      // additional properties are deleted as we don't want to transfer e.g. Plugin instances
      port.postMessage({ result: { code, sourcetype, map } })
    } catch (error) {
      port.postMessage({ error })
    }

    port.close()
  })
}
