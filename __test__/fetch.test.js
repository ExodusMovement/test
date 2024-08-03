jest.exodus.mock.fetchReplay()
// jest.exodus.mock.fetchRecord()

describe('fetch replay', () => {
  test('https://example.com', async () => {
    const res = await fetch('https://example.com')
    expect(res.status).toBe(200)
    expect(res.ok).toBe(true)
    await expect(res.clone().json()).rejects.toThrow(/Unexpected token/)
    expect(await res.text()).toMatch(/This domain is for use in illustrative examples in documents/)
  })

  test('https://jsonplaceholder.typicode.com/posts', async () => {
    const res = await fetch('https://jsonplaceholder.typicode.com/posts')
    expect(res.status).toBe(200)
    expect(res.ok).toBe(true)
    const posts = await res.json()
    expect(posts.length).toBe(100)
    expect(posts[99].userId).toBe(10)
  })

  test('https://jsonplaceholder.typicode.com/users with headers in plain object', async () => {
    const headers = { accept: 'application/json' }
    const res = await fetch('https://jsonplaceholder.typicode.com/users', { headers })
    expect(res.status).toBe(200)
    expect(res.ok).toBe(true)
    const users = await res.json()
    expect(users.length).toBe(10)
    expect(new Map(res.headers).get('content-type')).toBe('application/json; charset=utf-8')
  })

  const testHeaders = typeof Headers === 'undefined' ? test.skip : test
  testHeaders('https://jsonplaceholder.typicode.com/users/2 with headers in Headers', async () => {
    const headers = new Headers()
    headers.append('accept', 'application/json')
    const res = await fetch('https://jsonplaceholder.typicode.com/users/2', { headers })
    expect(res.status).toBe(200)
    expect(res.ok).toBe(true)
    const user = await res.json()
    expect(user.name).toBe('Ervin Howell')
    expect(res.headers.constructor).toBe(Headers)
    expect(res.headers.get('ConTent-tYpE')).toBe('application/json; charset=utf-8')
  })
})
