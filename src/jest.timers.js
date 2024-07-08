import assert from 'node:assert/strict'
import { mock } from 'node:test'

const [major, minor] = process.versions.node.split('.').map(Number)

const assertHaveTimers = () =>
  assert(mock.timers, 'Timer mocking requires Node.js >=20.4.0 || 18 >=18.19.0')

let timersWarned = false
const warnOldTimers = () => {
  if (timersWarned) return
  timersWarned = true
  const ok = major >= 22 || (major === 20 && minor >= 11)
  if (!ok) console.warn('Warning: timer mocks are known to be glitchy before Node.js >=20.11.0')
}

export const useRealTimers = () => {
  mock.timers.reset()
  return jest
}

export const useFakeTimers = ({ doNotFake = [], ...rest } = {}) => {
  assertHaveTimers()
  warnOldTimers()
  assert.deepEqual(rest, {}, 'Unsupported options')
  const allApis = ['setInterval', 'setTimeout', 'setImmediate', 'Date']
  for (const name of doNotFake) assert(allApis.includes(name), `Unknown API: ${name}`)
  const apis = allApis.filter((name) => !doNotFake.includes(name))
  try {
    mock.timers.enable({ apis })
  } catch (e) {
    // We allow calling this multiple times and swallow the "MockTimers is already enabled!" error
    if (e.code !== 'ERR_INVALID_STATE') throw e
  }

  return jest
}

export const runAllTimers = () => {
  assertHaveTimers()
  warnOldTimers()
  mock.timers.tick(100_000_000_000) // > 3 years
  return jest
}

export const runOnlyPendingTimers = () => {
  const noInfiniteLoopBug = major >= 22 || (major === 20 && minor >= 11)
  assert(noInfiniteLoopBug, 'runOnlyPendingTimers requires Node.js >=20.11.0')
  mock.timers.runAll()
  return jest
}

export const advanceTimersByTime = (time) => {
  assertHaveTimers()
  warnOldTimers()
  mock.timers.tick(time)
  return jest
}

export const advanceTimersByTimeAsync = async (time) => jest.advanceTimersByTime(time)

export const setSystemTime = (time) => {
  mock.timers.setTime(+time)
  return jest
}
