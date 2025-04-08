import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

// Can modify PATH to add the binary to it!
function findBinaryOnce(name) {
  const paths = []
  const addPaths = (platform, ...args) => process.platform === platform && paths.push(...args)

  switch (name) {
    case 'hermes':
      try {
        const dir = dirname(require.resolve('hermes-engine-cli/package.json'))
        const platformDirs = { darwin: 'osx-bin', linux: 'linux64-bin', win32: 'win64-bin' }
        if (Object.hasOwn(platformDirs, process.platform)) {
          process.env.PATH = `${join(dir, platformDirs[process.platform])}:${process.env.PATH}`
        } else {
          console.error(`Unexpected platform: ${process.platform}`)
        }
      } catch {
        console.warn("'hermes-engine-cli' not installed, attempting to load global `hermes`...")
      }

      return 'hermes'
    case 'jsc':
      if (process.platform === 'darwin') {
        const prefix = '/System/Library/Frameworks/JavaScriptCore.framework/Versions/A'
        for (const dir of [`${prefix}/Helpers`, `${prefix}/Resources`]) {
          if (existsSync(join(dir, 'jsc'))) {
            process.env.PATH = `${dir}:${process.env.PATH}`
            break
          }
        }
      }

      return 'jsc'
    case 'electron':
      return require('electron')
    case 'c8':
      return require.resolve('c8/bin/c8.js')
    case 'chrome':
      addPaths('darwin', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
      addPaths('linux', '/usr/bin/chromium', '/snap/bin/chromium', '/usr/bin/google-chrome')
      break
    case 'firefox':
      addPaths('darwin', '/Applications/Firefox.app/Contents/MacOS/firefox')
      addPaths('linux', '/usr/bin/firefox')
      break
    case 'safari':
      addPaths('darwin', '/Applications/Safari.app/Contents/MacOS/Safari')
      break
    default:
      throw new Error('Trying to find an unexpected executable name')
  }

  for (const path of paths) if (existsSync(path)) return path
  throw new Error(`Failed to find ${name} executable`)
}

const binaries = new Map()

export function findBinary(name) {
  if (!binaries.has(name)) binaries.set(name, findBinaryOnce(name))
  return binaries.get(name)
}
