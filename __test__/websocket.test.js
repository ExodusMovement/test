/* eslint-disable unicorn/prefer-add-event-listener */

jest.exodus.mock.websocketReplay()
// jest.exodus.mock.websocketRecord()
// jest.exodus.mock.websocketRecord({ WebSocket: (await import('ws')).default })
// import WebSocket from 'ws'

const message = async (ee) => on(ee, 'message').then((event) => event.data)
const on = (ee, acc, rej = 'error') =>
  new Promise((resolve, reject) => {
    Object.assign(ee, { [`on${acc}`]: resolve, [`on${rej}`]: reject })
  })

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

  await on(socket, 'open')

  expect(socket.protocol).toBe('test')
  expect(socket.readyState).toBe(WebSocket.OPEN)
  expect(messages.length).toBe(0)
  expect(listenerMessagesBefore).toEqual(messages)
  expect(listenerMessagesAfter).toEqual(messages)

  expect(socket.bufferedAmount).toBe(0)
  socket.send('Hi there')
  expect(socket.bufferedAmount).not.toBe(0)
  expect(socket.bufferedAmount).toBeGreaterThanOrEqual(8)

  const result = await on(socket, 'close')

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

  const errorEvent = await on(socket, 'error', 'open') // Swapped on a purpose!

  expect(errorEvent.type).toBe('error')
  expect(errorEvent.error).toBeTruthy()
  expect(errorEvent.error instanceof Error).toBe(true)
  expect(errorEvent.error.message).toBeString()

  expect(socket.protocol).toBe('')
  expect(messages.length).toBe(0)
  expect(messages).toEqual([])
})

const { Blob } = globalThis
const testWithBlobs = Blob ? test : test.skip
testWithBlobs('buffer echo', async () => {
  const socket = new WebSocket('wss://echo.websocket.org/')
  const messages = []
  socket.addEventListener('message', (event) => messages.push(event.data))

  expect(socket.readyState).toBe(WebSocket.CONNECTING)

  await on(socket, 'open')
  expect(socket.readyState).toBe(WebSocket.OPEN)
  expect(messages.length).toBe(0)

  expect(await message(socket)).toMatch(/^Request served by/)
  expect(messages.length).toBe(1)

  const toArrayBuffer = (t) => t.buffer.slice(t.byteOffset, t.byteOffset + t.byteLength)
  const byteSize = (x) => x.byteLength ?? x.size ?? x.length
  const toBuffer = async (x) => Buffer.from(x instanceof Blob ? await x.arrayBuffer() : x) // async or sync
  const expectBufferResponse = async (input, type) => {
    socket.send(input)
    await expectBuffer(await message(socket), input, type)
  }

  const expectBuffer = async (data, input, type) => {
    expect(data).toBeTruthy()
    // expect.toBe is cryptic on this: expect(Blob.prototype).toBe(ArrayBuffer.prototype), hence we use ===
    expect(Object.getPrototypeOf(data) === type.prototype).toBe(true)
    expect(byteSize(data)).toBe(byteSize(input))
    // expect.toEqual can't compare ArrayBuffer instances and always returns true!
    expect(await toBuffer(data)).toEqual(await toBuffer(data))
  }

  socket.binaryType = 'arraybuffer'
  expect(socket.binaryType).toBe('arraybuffer')
  await expectBufferResponse('Hello here', String)
  await expectBufferResponse(Buffer.from('Hello there'), ArrayBuffer)
  await expectBufferResponse(new Uint8Array([3, 5, 7]), ArrayBuffer)
  await expectBufferResponse(new Uint32Array([2 ** 32 - 1, 2 ** 16, 2 ** 31]), ArrayBuffer)
  await expectBufferResponse(toArrayBuffer(new Uint8Array([1, 42, 0, 2])), ArrayBuffer)
  await expectBufferResponse(new Blob(['one', 'two']), ArrayBuffer)

  socket.binaryType = 'blob'
  expect(socket.binaryType).toBe('blob')
  await expectBufferResponse('This is not a blob', String)
  await expectBufferResponse(Buffer.from('This is a blob'), Blob)
  await expectBufferResponse(new Uint8Array([11, 22, 44, 57]), Blob)
  await expectBufferResponse(new Uint32Array([2 ** 16, 2 ** 32 - 1, 0, 2 ** 31]), Blob)
  await expectBufferResponse(toArrayBuffer(new Uint8Array([51, 0, 53, 52])), Blob)
  await expectBufferResponse(new Blob(['three', 'four', 'five']), Blob)

  // Messages order for blobs (those are async to serialize)
  const arr = []
  await new Promise((resolve, reject) => {
    socket.onerror = reject
    socket.onmessage = (event) => {
      arr.push(event.data)
      if (arr.length === 3) resolve()
    }

    socket.send(new Blob(['Sending a Blob']))
    socket.send(Buffer.from('Sending a Buffer'))
    socket.send('Sending a string')
  })
  await expectBuffer(arr[0], Buffer.from('Sending a Blob'), Blob)
  await expectBuffer(arr[1], Buffer.from('Sending a Buffer'), Blob)
  expect(arr[2]).toBe('Sending a string')

  socket.close()
  expect(socket.readyState).toBe(WebSocket.CLOSING)

  const result = await on(socket, 'close')
  expect(result.type).toBe('close')
  expect(socket.readyState).toBe(WebSocket.CLOSED)
  expect(messages.length).toBe(16) // 1 + 6 + 6 + 3
})
