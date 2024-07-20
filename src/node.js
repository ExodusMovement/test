import { setSnapshotSerializers as setDefaultSnapshotSerializers } from './engine.js'

function setResolveSnapshotPath() {
  // TODO: might want to test it and allow if it's pure / doesn't depend on fs
  throw new Error('Unsupported due to possible environment differences')
}

export const snapshot = { setDefaultSnapshotSerializers, setResolveSnapshotPath }

export { mock, describe, test, beforeEach, afterEach, before, after } from './engine.js'
