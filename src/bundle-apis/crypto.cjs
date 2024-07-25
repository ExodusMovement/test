const cb = require('crypto-browserify')
const webcrypto = globalThis.crypto
const randomUUID = () => webcrypto.randomUUID()
const getRandomValues = (array) => webcrypto.getRandomValues(array)
module.exports = { ...cb, webcrypto, subtle: webcrypto.subtle, randomUUID, getRandomValues }
