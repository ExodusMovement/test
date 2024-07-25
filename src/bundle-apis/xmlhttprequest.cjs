const XMLHttpRequest = () => {
  throw new Error('module unsupported in bundled form: xmlhttprequest, xmlhttprequest-ssl')
}

XMLHttpRequest.XMLHttpRequest = XMLHttpRequest
module.exports = XMLHttpRequest
