import { mock, assert, awaitForMicrotaskQueue } from './engine.js'
import { jestConfig } from './jest.config.js'
import { haveValidTimers, haveNoTimerInfiniteLoopBug } from './version.js'

const assertHaveTimers = () =>
  assert(mock.timers, 'Timer mocking requires Node.js >=20.4.0 || 18 >=18.19.0')

let timersWarned = false
const warnOldTimers = () => {
  if (haveValidTimers || timersWarned) return
  timersWarned = true
  console.warn('Warning: timer mocks are known to be glitchy before Node.js >=20.11.0')
}

let enabled = false
const assertEnabledTimers = () => {
  assertHaveTimers()
  assert(enabled, 'You should enable MockTimers first by calling useFakeTimers()')
}

export function useRealTimers() {
  mock.timers?.reset()
  enabled = false
  return this
}

const doNotFakeDefault = jestConfig().fakeTimers?.doNotFake ?? []

export function useFakeTimers({ doNotFake = doNotFakeDefault, ...rest } = {}) {
  assertHaveTimers()
  warnOldTimers()
  assert.deepEqual(rest, {}, 'Unsupported options')
  const allApis = ['setInterval', 'setTimeout', 'setImmediate']
  if (haveValidTimers) allApis.push('Date') // vas not supported in older versions
  for (const name of doNotFake) assert(allApis.includes(name), `Unknown API: ${name}`)
  const apis = allApis.filter((name) => !doNotFake.includes(name))
  try {
    mock.timers.enable(haveValidTimers ? { apis } : apis) // in older (aka glitchy) versions it's an array
  } catch (e) {
    // We allow calling this multiple times and swallow the "MockTimers is already enabled!" error
    if (e.code !== 'ERR_INVALID_STATE') throw e
  }

  // Work-around a bug
  // Ref: https://github.com/nodejs/node/pull/54005
  for (const name of ['clearTimeout', 'clearInterval', 'clearImmediate']) {
    const fn = globalThis[name]
    globalThis[name] = (id) => id && fn(id)
  }

  enabled = true
  return this
}

export function runAllTimers() {
  assertEnabledTimers()
  advanceTimersByTime(100_000_000_000) // > 3 years
  return this
}

export function runOnlyPendingTimers() {
  assertEnabledTimers()
  assert(haveNoTimerInfiniteLoopBug, 'runOnlyPendingTimers requires Node.js >=20.11.0')
  mock.timers.runAll()
  return this
}

export function advanceTimersByTime(time) {
  assert(Number.isSafeInteger(time) && time >= 0)
  assertEnabledTimers()

  if (time === 0) {
    mock.timers.tick(0)
    return this
  }

  // We split this into multiple steps to run timers scheduled during the time we are running
  const minSteps = Math.min(1000, time) // usually just split e.g. 5 seconds into 1000 * 5ms
  const step = Number(Math.floor(time / minSteps).toPrecision(1))
  const steps = Math.floor(time / step) // up to 2x higher than minSteps
  const last = time - steps * step
  // 1999 -> { step: 1, steps: 1999, last: 0 }
  // 2001 -> { step: 2, steps: 1000, last: 1 }
  for (let i = 0; i < steps; i++) {
    if (!enabled) break // got disabled while looping
    mock.timers.tick(step)
  }

  if (last > 0 && enabled) mock.timers.tick(last)
  return this
}

export async function runAllTimersAsync() {
  await awaitForMicrotaskQueue() // before running timers, per jest doc
  runAllTimers()
  await awaitForMicrotaskQueue() // jest doc is misleading and it also does this after running timers
  return this
}

export async function runOnlyPendingTimersAsync() {
  await awaitForMicrotaskQueue() // before running timers, per jest doc
  runOnlyPendingTimers()
  await awaitForMicrotaskQueue() // jest doc is misleading and it also does this after running timers
  return this
}

export async function advanceTimersByTimeAsync(time) {
  assertEnabledTimers()
  if (mock.timers.tickAsync) {
    await mock.timers.tickAsync(time)
  } else {
    for (let i = 0; i < time; i++) {
      await awaitForMicrotaskQueue()
      if (!enabled) break // got disabled while looping
      mock.timers.tick(1)
    }
  }

  await awaitForMicrotaskQueue() // jest doc is misleading and it also does this after running timers
  return this
}

export function setSystemTime(time) {
  assertEnabledTimers()
  mock.timers.setTime(+time)
  return this
}
