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

  // Attach a listener before .onmessage
  const listenerMessagesBefore = []
  socket.addEventListener('message', (event) => {
    expect(listenerMessagesBefore).toEqual(messages)
    listenerMessagesBefore.push(event.data)
    expect(listenerMessagesBefore).not.toEqual(messages)
  })

  const messages = []
  socket.onmessage = (event) => {
    messages.push(event.data)
    socket.close()
    expect(socket.readyState).toBe(WebSocket.CLOSING)
  }

  // Attach a listener after .onmessage
  const listenerMessagesAfter = []
  socket.addEventListener('message', (event) => {
    expect(listenerMessagesAfter).not.toEqual(messages)
    listenerMessagesAfter.push(event.data)
    expect(listenerMessagesAfter).toEqual(messages)
  })

  await new Promise((resolve, reject) => {
    socket.onopen = resolve
    socket.onerror = reject
  })

  expect(socket.protocol).toBe('test')
  expect(socket.readyState).toBe(WebSocket.OPEN)
  expect(messages.length).toBe(0)
  expect(listenerMessagesBefore).toEqual(messages)
  expect(listenerMessagesAfter).toEqual(messages)

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
  expect(listenerMessagesBefore).toEqual(messages)
  expect(listenerMessagesAfter).toEqual(messages)
})

test('connection error', async () => {
  const socket = new WebSocket('wss://localhost:1/')
  expect(socket.extensions).toBe('')
  expect(socket.protocol).toBe('')
  expect(socket.readyState).toBe(WebSocket.CONNECTING)

  const messages = []
  socket.onmessage = (event) => messages.push(event.data)

  const errorEvent = await new Promise((resolve, reject) => {
    // Swapped on a purpose!
    socket.onopen = reject
    socket.onerror = resolve
  })

  expect(errorEvent.type).toBe('error')
  expect(errorEvent.error).toBeTruthy()
  expect(errorEvent.error instanceof Error).toBe(true)
  expect(errorEvent.error.message).toBeString()

  expect(socket.protocol).toBe('')
  expect(messages.length).toBe(0)
  expect(messages).toEqual([])
})
