jest.useFakeTimers()

const testTimers = !jest.exodus || jest.exodus.features.timers ? test : test.skip

testTimers('setInterval / clearInterval', () => {
  let ticks = 0
  const interval = setInterval(() => ticks++, 1000)
  jest.advanceTimersByTime(1000)
  expect(ticks).toBe(1)
  jest.advanceTimersByTime(1000)
  expect(ticks).toBe(2)
  jest.advanceTimersByTime(500)
  expect(ticks).toBe(2)
  jest.advanceTimersByTime(500)
  expect(ticks).toBe(3)
  clearInterval(interval)
  jest.advanceTimersByTime(1500)
  expect(ticks).toBe(3)
  jest.advanceTimersByTime(10_000)
  expect(ticks).toBe(3)
})

testTimers('setInterval / clearInterval + runOnlyPendingTimers', () => {
  let ticks = 0
  const interval = setInterval(() => ticks++, 1000)
  jest.runOnlyPendingTimers()
  expect(ticks).toBe(1)
  jest.runOnlyPendingTimers()
  expect(ticks).toBe(2)
  jest.advanceTimersByTime(500)
  expect(ticks).toBe(2)
  jest.advanceTimersByTime(500)
  expect(ticks).toBe(3)
  clearInterval(interval)
  jest.advanceTimersByTime(1500)
  expect(ticks).toBe(3)
  jest.runOnlyPendingTimers()
  expect(ticks).toBe(3)
})
