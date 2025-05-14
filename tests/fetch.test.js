jest.exodus.mock.fetchReplay()
// jest.exodus.mock.fetchRecord()

// Gecko: "JSON.parse: unexpected character at line {} column {} of the JSON data"
// Safari: "The string did not match the expected pattern."
const JSON_ERROR_REGEX =
  /(not valid JSON|^JSON Parse error|^Failed to parse JSON|^Unexpected token .* in JSON|^JSON\.parse: unexpected character|^The string did not match the expected pattern\.$|invalid character \(in JSON\.parse\))|^unexpected token: '.'$|^Invalid value\.$/

describe('fetch replay', () => {
  test('https://example.com', async () => {
    const res = await fetch('https://example.com')
    expect(res.status).toBe(200)
    expect(res.ok).toBe(true)
    expect(res.url).toBe('https://example.com/') // Normalized!
    expect(res.type).toBe('basic')
    await expect(res.clone().json()).rejects.toThrow(JSON_ERROR_REGEX)
    expect(await res.text()).toMatch(/This domain is for use in illustrative examples in documents/)
  })

  test('https://jsonplaceholder.typicode.com/posts', async () => {
    const res = await fetch('https://jsonplaceholder.typicode.com/posts')
    expect(res.status).toBe(200)
    expect(res.ok).toBe(true)
    expect(res.url).toBe('https://jsonplaceholder.typicode.com/posts')
    expect(res.type).toBe('basic')
    const posts = await res.json()
    expect(posts.length).toBe(100)
    expect(posts[99].userId).toBe(10)
  })

  test('https://jsonplaceholder.typicode.com/users with headers in plain object', async () => {
    const headers = { accept: 'application/json' }
    const res = await fetch('https://jsonplaceholder.typicode.com/users', { headers })
    expect(res.status).toBe(200)
    expect(res.ok).toBe(true)
    expect(res.url).toBe('https://jsonplaceholder.typicode.com/users')
    expect(res.type).toBe('basic')
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
    expect(res.url).toBe('https://jsonplaceholder.typicode.com/users/2')
    expect(res.type).toBe('basic')
    const user = await res.json()
    expect(user.name).toBe('Ervin Howell')
    expect(res.headers.constructor).toBe(Headers)
    expect(res.headers.get('ConTent-tYpE')).toBe('application/json; charset=utf-8')
  })

  test('https://example.com/404', async () => {
    const res = await fetch('https://example.com/404')
    expect(res.status).toBe(404)
    expect(res.ok).toBe(false)
    expect(res.url).toBe('https://example.com/404')
    expect(res.type).toBe('basic')
    await expect(res.clone().json()).rejects.toThrow(JSON_ERROR_REGEX)
    expect(await res.text()).toMatch(/This domain is for use in illustrative examples in documents/) // same text
  })
})
