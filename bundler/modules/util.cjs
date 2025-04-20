const util = require('util/util.js')
const format = require('./util-format.cjs')
const { TextEncoder, TextDecoder } = globalThis
module.exports = { ...util, format, TextEncoder, TextDecoder }
