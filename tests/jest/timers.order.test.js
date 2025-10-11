const N = process.env.EXODUS_TEST_PLATFORM === 'engine262' ? 50 : 500
// time is selected so that advanceTimersByTime() has to put most of the timers into a single timers.tick() call
const time = N * 499

test('setTimeout() order is correct, direct', async () => {
  const res = []
  jest.useFakeTimers()
  for (let i = 0; i < N; i++) setTimeout(() => res.push(i), i)
  jest.advanceTimersByTime(time)
  jest.useRealTimers()
  expect(res.length).toBe(N)
  expect(new Set(res).size).toBe(N)
  expect(res).toStrictEqual([...res].sort((a, b) => a - b))
})

test('setTimeout() order is correct, reverse', async () => {
  const res = []
  jest.useFakeTimers()
  for (let i = N; i > 0; i--) setTimeout(() => res.push(i), i)
  jest.advanceTimersByTime(time)
  jest.useRealTimers()
  expect(res.length).toBe(N)
  expect(new Set(res).size).toBe(N)
  expect(res).toStrictEqual([...res].sort((a, b) => a - b))
})

test('setImmediate() order is correct', async () => {
  const res = []
  jest.useFakeTimers()
  for (let i = 0; i < N; i++) setImmediate(() => res.push(i))
  jest.advanceTimersByTime(time)
  jest.useRealTimers()
  expect(res.length).toBe(N)
  expect(new Set(res).size).toBe(N)
  expect(res).toStrictEqual([...res].sort((a, b) => a - b))
})
