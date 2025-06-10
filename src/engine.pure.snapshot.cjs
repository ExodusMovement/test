const nameCounts = new Map()
let snapshotText, snapshotTextClean

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
  if (!snapshotTextClean) snapshotTextClean = snapshotText.replaceAll('\r\n', '\n') // clean crlf

  const count = (nameCounts.get(name) || 0) + 1
  nameCounts.set(name, count)
  const escaped = escapeSnapshot(serialized)
  const key = `${name} ${count}`
  const makeEntry = (x) => `\nexports[\`${escapeSnapshot(key)}\`] = \`${x}\`;\n`
  const fixedText = escaped.includes('\r') ? snapshotText : snapshotTextClean // well, if we expect \r let's preserve them
  const final = escaped.includes('\n') ? `\n${escaped}\n` : escaped
  if (fixedText.includes(makeEntry(final))) return
  // Perhaps wrapped with newlines from Node.js snapshots?
  if (!final.includes('\n') && fixedText.includes(makeEntry(`\n${final}\n`))) return
  return assert.fail(`Could not match "${key}" in snapshot. ${addFail}`)
}

module.exports = { escapeSnapshot, matchSnapshot }
