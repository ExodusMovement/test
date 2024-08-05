/* eslint-disable unicorn/prefer-add-event-listener */

jest.exodus.mock.websocketReplay()
// jest.exodus.mock.websocketRecord()
// jest.exodus.mock.websocketRecord({ WebSocket: (await import('ws')).default })
// import WebSocket from 'ws'

test('static properties', () => {
  expect(WebSocket.CONNECTING).toBe(0)
  expect(WebSocket.OPEN).toBe(1)
  expect(WebSocket.CLOSING).toBe(2)
  expect(WebSocket.CLOSED).toBe(3)
})

test('javascript.info /demo/hello', async () => {
  const socket = new WebSocket('wss://javascript.info/article/websocket/demo/hello', ['test'])
  expect(socket.extensions).toBe('')
  expect(socket.protocol).toBe('')
  expect(socket.readyState).toBe(WebSocket.CONNECTING)

  const messages = []
  socket.onmessage = (event) => {
    messages.push(event.data)
    socket.close()
    expect(socket.readyState).toBe(WebSocket.CLOSING)
  }

  await new Promise((resolve, reject) => {
    socket.onopen = resolve
    socket.onerror = reject
  })

  expect(socket.protocol).toBe('test')
  expect(socket.readyState).toBe(WebSocket.OPEN)
  expect(messages.length).toBe(0)

  expect(socket.bufferedAmount).toBe(0)
  socket.send('Hi there')
  expect(socket.bufferedAmount).not.toBe(0)
  expect(socket.bufferedAmount).toBeGreaterThanOrEqual(8)

  const result = await new Promise((resolve, reject) => {
    socket.onclose = resolve
    socket.onerror = reject
  })

  expect(result.type).toBe('close')
  expect(socket.protocol).toBe('test')
  expect(socket.readyState).toBe(WebSocket.CLOSED)
  expect(messages.length).toBe(1)
  expect(messages).toEqual(['Hello from server, there!'])
})
