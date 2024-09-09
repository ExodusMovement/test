const nameCounts = new Map()
let snapshotText

const escapeSnapshot = (str) => str.replaceAll(/([\\`])/gu, '\\$1')

function matchSnapshot(readSnapshot, assert, name, serialized) {
  // We don't have native snapshots, polyfill reading
  if (snapshotText !== null) {
    try {
      const snapshotRaw = readSnapshot()
      snapshotText = snapshotRaw ? `\n${snapshotRaw}\n` : null // we'll search wrapped in \n
    } catch {
      snapshotText = null
    }
  }

  const addFail = `Adding new snapshots requires Node.js >=22.3.0`

  // We don't support polyfilled snapshot generation here, only parsing
  // Also be careful with assertion plan counters
  if (!snapshotText) assert.fail(`Could not find snapshot file. ${addFail}`)

  const count = (nameCounts.get(name) || 0) + 1
  nameCounts.set(name, count)
  const escaped = escapeSnapshot(serialized)
  const key = `${name} ${count}`
  const makeEntry = (x) => `\nexports[\`${escapeSnapshot(key)}\`] = \`${x}\`;\n`
  const final = escaped.includes('\n') ? `\n${escaped}\n` : escaped
  if (snapshotText.includes(makeEntry(final))) return
  // Perhaps wrapped with newlines from Node.js snapshots?
  if (!final.includes('\n') && snapshotText.includes(makeEntry(`\n${final}\n`))) return
  return assert.fail(`Could not match "${key}" in snapshot. ${addFail}`)
}

module.exports = { escapeSnapshot, matchSnapshot }
