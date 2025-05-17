let prettyFormat

function loadPrettyFormat() {
  if (prettyFormat) return
  try {
    prettyFormat = require('pretty-format')
  } catch {
    // TODO: find a way to load it only for mocks that could affect pretty-format
    throw new Error(`Failed to load 'pretty-format'. Used for jest snapshots, .each and mocks`)
  }
}

function format(val, options) {
  loadPrettyFormat()
  return prettyFormat.format(val, options)
}

function formatWithAllPlugins(val, options) {
  loadPrettyFormat()
  const plugins = Object.values(prettyFormat.plugins)
  if (options.plugins) plugins.push(...options.plugins)
  return prettyFormat.format(val, { ...options, plugins })
}

module.exports = { loadPrettyFormat, format, formatWithAllPlugins }
