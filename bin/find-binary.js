import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const nvm = process.env.NVM_BIN ? (x) => join(process.env.NVM_BIN, '../lib/node_modules', x) : null
const jsvu = (x) => join(homedir(), '.jsvu/bin', x)

// Can modify PATH to add the binary to it!
function findBinaryOnce(name) {
  // For browsers where full path is needed
  const paths = []
  const addPaths = (platform, ...args) => process.platform === platform && paths.push(...args)

  // For js engines where we can fall back to the command name
  const findFile = (methods, allowGlobal = true) => {
    for (const x of methods) {
      try {
        const file = x(process.platform === 'win32' ? `${name}.exe` : name)
        if (file && existsSync(file)) return file
      } catch {}
    }

    if (!allowGlobal) {
      console.error(`Local ${name} not installed, refusing to run`)
      process.exit(1)
    }

    console.warn(`Local ${name} not installed, attempting to load global ${name}...`)
    return name
  }

  switch (name) {
    case 'hermes': {
      const flavors = { darwin: 'osx-bin', linux: 'linux64-bin', win32: 'win64-bin' }
      const flavor = Object.hasOwn(flavors, process.platform) ? flavors[process.platform] : null
      return findFile([
        (bin) => flavor && require.resolve(`react-native/sdks/hermesc/${flavor}/${bin}`), // 1. Locally installed react-native dep (works only for osx)
        (bin) => flavor && require.resolve(`hermes-engine-cli/${flavor}/${bin}`), // 2. Locally installed hermes-engine-cli
        (bin) => jsvu(bin), // 3. jsvu
        (bin) => nvm(`hermes-engine-cli/${flavor}/${bin}`), // 4. hermes-engine-cli installed in .nvm dir with npm i -g
      ]) // 5. hermes installed in the system
    }

    case 'jsc':
      return findFile([
        (bin) => jsvu(bin), // prefer jsvu
        (bin) => `/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/${bin}`,
        (bin) => `/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Resources/${bin}`,
      ])
    case 'd8':
      return findFile([() => jsvu('v8')]) // jsvu names it v8
    case 'spidermonkey':
    case 'quickjs':
      return findFile([jsvu])
    case 'xs':
      return findFile([jsvu], false)
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
