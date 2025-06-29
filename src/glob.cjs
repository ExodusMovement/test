const fs = require('node:fs/promises')

async function glob(patterns, { exclude, cwd }) {
  try {
    const fastGlob = require('fast-glob')
    return fastGlob(patterns, { ignore: exclude, cwd, followSymbolicLinks: false })
  } catch {}

  // Experimental, but works
  return Array.fromAsync(fs.glob(patterns, { exclude, cwd }))
}

module.exports = { glob }
