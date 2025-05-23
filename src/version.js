import { assert, nodeVersion } from './engine.js'

const [major, minor, patch] = nodeVersion.split('.').map(Number)
// Before 20.18, there are no module mocks
const ok = (major === 20 && minor >= 18) || (major === 22 && minor >= 4) || major > 22
assert(ok, 'Node.js version too old, use ^20.18.0 || >=22.4.0')

export { major, minor, patch }

export const haveModuleMocks = true
export const haveSnapshots = (major === 22 && minor >= 3) || major > 22
export const haveSnapshotsReportUnescaped = (major === 22 && minor >= 5) || major > 22
