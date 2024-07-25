// Should not be an arrow function as might be used as a constructor
const XMLHttpRequest = function () {
  throw new Error('module unsupported in bundled form: xmlhttprequest, xmlhttprequest-ssl')
}

XMLHttpRequest.XMLHttpRequest = XMLHttpRequest
module.exports = XMLHttpRequest
