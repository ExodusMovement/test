import assert from 'node:assert/strict'

const [major, minor, patch] = process.versions.node.split('.').map(Number)
assert(major !== 21, 'Node.js 21.x is deprecated!') // reached EOL, no reason to even test
// older versions are glitchy with before/after on top-level, which is a deal-breaker
const ok = (major === 18 && minor >= 19) || (major === 20 && minor >= 7) || major >= 22
assert(ok, 'Node.js version too old or glitchy with node:test, use ^18.19.0 || ^20.7.0 || >=22.0.0')

export { major, minor, patch }

export const haveModuleMocks = (major === 22 && minor >= 3) || major > 22
export const haveSnapshots = (major === 22 && minor >= 3) || major > 22
export const haveForceExit = (major === 20 && minor > 13) || major >= 22
export const haveWatch = (major === 18 && minor > 13) || major >= 20
export const haveValidTimers = (major === 20 && minor >= 11) || major >= 22 // older glitch in various ways / stop executing
export const haveNoTimerInfiniteLoopBug = (major === 20 && minor >= 11) || major >= 22 // mock.timers.runAll() can get into infinite recursion
