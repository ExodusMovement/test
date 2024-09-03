const { Agent, Server, createServer, get, request } = require('./http.cjs')
const inherited = { Agent, Server, createServer, get, request }
module.exports = {
  ...inherited,
  get globalAgent() {
    throw new Error('https.globalAgent unsupported in bundled mode')
  },
  set globalAgent(value) {
    throw new Error('https.globalAgent unsupported in bundled mode')
  },
}
