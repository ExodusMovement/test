const testTimers = !jest.exodus || jest.exodus.features.timers ? test : test.skip
const textExodus = jest.exodus ? testTimers : test.skip

textExodus('advanceTimersByTime() throws when timer is not started', async () => {
  expect(() => jest.advanceTimersByTime(10_000)).toThrow('You should enable')
})

textExodus('advanceTimersByTime() throws when timer is stopped', async () => {
  jest.useFakeTimers()
  jest.useRealTimers()
  expect(() => jest.advanceTimersByTime(10_000)).toThrow('You should enable')
})

testTimers('advanceTimersByTime() is ok with timers restored from timer', async () => {
  jest.useFakeTimers()
  setTimeout(() => jest.useRealTimers(), 100)
  jest.advanceTimersByTime(10_000)
  jest.useRealTimers()
})

testTimers('advanceTimersByTime() ticks recursive timeouts', async () => {
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

testTimers('advanceTimersByTimeAsync() is ok with timers restored from timer', async () => {
  jest.useFakeTimers()
  setTimeout(() => jest.useRealTimers(), 100)
  await jest.advanceTimersByTimeAsync(10_000)
  jest.useRealTimers()
})

testTimers('advanceTimersByTimeAsync() is ok with timers restored before await', async () => {
  jest.useFakeTimers()
  const promise = jest.advanceTimersByTimeAsync(10_000)
  jest.useRealTimers()
  await promise
})

testTimers('advanceTimersByTimeAsync() ticks recursive timeouts', async () => {
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
