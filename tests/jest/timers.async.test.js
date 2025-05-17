jest.useFakeTimers()

const delayTime = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const delay100cycles = async () => {
  for (let i = 0; i < 100; i++) await Promise.resolve()
}

test('advanceTimersByTime() does not let microtasks to pass', () => {
  const fn = jest.fn()
  delay100cycles().then(() => setTimeout(fn, 10))
  jest.advanceTimersByTime(20)
  expect(fn).not.toHaveBeenCalled()
})

test('advanceTimersByTime() does not let microtasks to pass even with await', async () => {
  const fn = jest.fn()
  delay100cycles().then(() => setTimeout(fn, 10))
  jest.advanceTimersByTime(20)
  expect(fn).not.toHaveBeenCalled()
})

test('advanceTimersByTimeAsync() lets microtasks to pass', async () => {
  const fn = jest.fn()
  delay100cycles().then(() => setTimeout(fn, 10))
  await jest.advanceTimersByTimeAsync(20)
  expect(fn).toHaveBeenCalled()
})

test('advanceTimersByTimeAsync() lets microtasks to pass, chained', async () => {
  const fn = jest.fn()
  delay100cycles()
    .then(() => delayTime(10))
    .then(() => setTimeout(fn, 10))
  await jest.advanceTimersByTimeAsync(1000)
  expect(fn).toHaveBeenCalled()
})

test('advanceTimersByTimeAsync() lets microtasks to pass, longer chained', async () => {
  const fn = jest.fn()
  delay100cycles()
    .then(() => delayTime(10))
    .then(delay100cycles)
    .then(() => setTimeout(fn, 10))
  await jest.advanceTimersByTimeAsync(1000)
  expect(fn).toHaveBeenCalled()
})

test('advanceTimersByTimeAsync() lets microtasks to pass, async chain', async () => {
  const fn = jest.fn()
  const doStuff = async (fn) => {
    for (let i = 0; i < 10; i++) {
      await delay100cycles()
      await delayTime(10)
    }

    fn()
  }

  doStuff(fn)
  await jest.advanceTimersByTimeAsync(10_000)
  expect(fn).toHaveBeenCalled()
})
