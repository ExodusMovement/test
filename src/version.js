import { assert, nodeVersion } from './engine.js'

const [major, minor, patch] = nodeVersion.split('.').map(Number)
assert(major !== 21, 'Node.js 21.x is deprecated!') // reached EOL, no reason to even test
// older versions are glitchy with before/after on top-level, which is a deal-breaker
// 20.7.0 is fine for node:test but broken with tsx, so we bump to 20.8.0
const ok = (major === 18 && minor >= 19) || (major === 20 && minor >= 8) || major >= 22
assert(ok, 'Node.js version too old or glitchy with node:test, use ^18.19.0 || ^20.8.0 || >=22.0.0')
assert(major !== 22 || minor !== 3, 'Refusing to run on Node.js 22.3.0 specifically, do not use it') // safe-guard

export { major, minor, patch }

export const haveModuleMocks = (major === 22 && minor >= 3) || major > 22
export const haveSnapshots = (major === 22 && minor >= 3) || major > 22
export const haveSnapshotsReportUnescaped = (major === 22 && minor >= 5) || major > 22
export const haveForceExit = (major === 20 && minor > 13) || major >= 22
export const haveValidTimers = (major === 20 && minor >= 11) || major >= 22 // older glitch in various ways / stop executing
export const haveNoTimerInfiniteLoopBug = (major === 20 && minor >= 11) || major >= 22 // mock.timers.runAll() can get into infinite recursion
