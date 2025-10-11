import { assert, nodeVersion } from './engine.js'

const [major, minor, patch] = nodeVersion.split('.').map(Number)
// Before 20.18, there are no module mocks
const ok = (major === 20 && minor >= 18) || (major === 22 && minor >= 6) || major > 22
assert(ok, 'Node.js version too old, use ^20.18.0 || >=22.6.0')

export { major, minor, patch }

// actually 22.3, but prior to 22.5 escaping is wrong. We don't support 22.3-22.5 anyway
export const haveSnapshots = (major === 22 && minor >= 5) || major > 22
export const haveCoverExclude = (major === 22 && minor >= 5) || major > 22
