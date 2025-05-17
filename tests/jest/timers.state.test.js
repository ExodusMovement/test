const textExodus = jest.exodus ? test : test.skip

textExodus('advanceTimersByTime() throws when timer is not started', async () => {
  expect(() => jest.advanceTimersByTime(10_000)).toThrow('You should enable')
})

textExodus('advanceTimersByTime() throws when timer is stopped', async () => {
  jest.useFakeTimers()
  jest.useRealTimers()
  expect(() => jest.advanceTimersByTime(10_000)).toThrow('You should enable')
})

test('advanceTimersByTime() is ok with timers restored from timer', async () => {
  jest.useFakeTimers()
  setTimeout(() => jest.useRealTimers(), 100)
  jest.advanceTimersByTime(10_000)
  jest.useRealTimers()
})

test('advanceTimersByTime() ticks recursive timeouts', async () => {
  let x = 0
  jest.useFakeTimers()
  setTimeout(() => {
    x++
    setTimeout(() => {
      x++
    }, 500)
  }, 100)
  jest.advanceTimersByTime(10_000)
  jest.useRealTimers()
  expect(x).toBe(2)
})

textExodus('advanceTimersByTime(0) ticks setTimeout(0), including nested', async () => {
  let x = 0
  jest.useFakeTimers()
  setTimeout(() => {
    x++
    setTimeout(() => {
      x++
    }, 0)
    setTimeout(() => {
      x++
      setTimeout(() => {
        x++
      }, 0)
    }, 0)
  }, 0)
  jest.advanceTimersByTime(0)
  expect(x).toBe(4) // jest fails and thinks this is 1, which is not in line with its recursive advanceTimersByTime behavior
  jest.useRealTimers()
})

textExodus('advanceTimersByTimeAsync() rejects when timer is not started', async () => {
  await expect(jest.advanceTimersByTimeAsync(10_000)).rejects.toThrow('You should enable')
})

textExodus('advanceTimersByTimeAsync() rejects when timer is stopped', async () => {
  jest.useFakeTimers()
  jest.useRealTimers()
  await expect(jest.advanceTimersByTimeAsync(10_000)).rejects.toThrow('You should enable')
})

test('advanceTimersByTimeAsync() is ok with timers restored from timer', async () => {
  jest.useFakeTimers()
  setTimeout(() => jest.useRealTimers(), 100)
  await jest.advanceTimersByTimeAsync(10_000)
  jest.useRealTimers()
})

test('advanceTimersByTimeAsync() is ok with timers restored before await', async () => {
  jest.useFakeTimers()
  const promise = jest.advanceTimersByTimeAsync(10_000)
  jest.useRealTimers()
  await promise
})

test('advanceTimersByTimeAsync() ticks recursive timeouts', async () => {
  let x = 0
  jest.useFakeTimers()
  setTimeout(() => {
    x++
    setTimeout(() => {
      x++
    }, 500)
  }, 100)
  await jest.advanceTimersByTimeAsync(10_000)
  jest.useRealTimers()
  expect(x).toBe(2)
})
