const N = process.env.EXODUS_TEST_PLATFORM === 'engine262' ? 100 : 1000
const time = 50

test('real setTimeout() order is correct, 0 seconds', async () => {
  const res = []
  for (let i = 0; i < N; i++) setTimeout(() => res.push(i), 0)
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(res.length).toBe(N)
  expect(new Set(res).size).toBe(N)
  expect(res).toStrictEqual([...res].sort((a, b) => a - b))
})

test('real setTimeout() order is correct, direct', async () => {
  const res = []
  for (let i = 0; i < N; i++) setTimeout(() => res.push(i), Math.floor((time * i) / N))
  await new Promise((resolve) => setTimeout(resolve, time))
  expect(res.length).toBe(N)
  expect(new Set(res).size).toBe(N)
  expect(res).toStrictEqual([...res].sort((a, b) => a - b))
})
