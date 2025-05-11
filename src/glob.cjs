const fs = require('node:fs/promises')

async function glob(patterns, { exclude, cwd }) {
  if (Array.fromAsync && fs.glob) {
    try {
      // We need to await here to try-catch
      return await Array.fromAsync(fs.glob(patterns, { exclude, cwd }))
    } catch {}
  }

  const fastGlob = require('fast-glob')
  return fastGlob(patterns, { ignore: exclude, cwd })
}

module.exports = { glob }
