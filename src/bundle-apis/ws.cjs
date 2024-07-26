// Should not be an arrow function as might be used as a constructor
const sub = function () {
  throw new Error('module unsupported in bundled form: ws')
}

class WebSocket {
  constructor() {
    throw new Error('module unsupported in bundled form: ws')
  }

  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  static Server = sub
  static Receiver = sub
  static Sender = sub
}

module.exports = WebSocket
