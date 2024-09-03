// Taken from https://jestjs.io/docs/timer-mocks

function timerGame(callback) {
  // console.log('Ready....go!')
  setTimeout(() => {
    // console.log("Time's up -- stop!")
    callback && callback()
  }, 1000)
}

jest.useFakeTimers()

test('calls the callback after 1 second', () => {
  const callback = jest.fn()

  timerGame(callback)

  // At this point in time, the callback should not have been called yet
  expect(callback).not.toHaveBeenCalled()

  // Fast-forward until all timers have been executed
  jest.runAllTimers()

  // Now our callback should have been called!
  expect(callback).toHaveBeenCalled()
  expect(callback).toHaveBeenCalledTimes(1)
})

it('calls the callback after 1 second via advanceTimersByTime', () => {
  const callback = jest.fn()

  timerGame(callback)

  // At this point in time, the callback should not have been called yet
  expect(callback).not.toHaveBeenCalled()

  // Fast-forward until all timers have been executed
  jest.advanceTimersByTime(1000)

  // Now our callback should have been called!
  expect(callback).toHaveBeenCalled()
  expect(callback).toHaveBeenCalledTimes(1)
})
