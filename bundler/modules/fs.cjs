const constants = require('constants-browserify')
const { resolve } = require('path')
const { F_OK, R_OK, W_OK, X_OK } = constants

// promises, sync, callbacks
const universalKeys = [
  'access',
  'appendFile',
  'chmod',
  'chown',
  'copyFile',
  'cp',
  'lchmod',
  'lchown',
  'link',
  'lstat',
  'lutimes',
  'mkdir',
  'mkdtemp',
  'open',
  'opendir',
  'readFile',
  'readdir',
  'readlink',
  'realpath',
  'rename',
  'rm',
  'rmdir',
  'stat',
  'statfs',
  'symlink',
  'truncate',
  'unlink',
  'utimes',
  'writeFile',
]

// promises
const promisesKeys = [...universalKeys, 'watch']

// sync, callbacks
const baseKeys = [
  ...universalKeys,
  'close',
  'exists',
  'fchmod',
  'fchown',
  'fdatasync',
  'fstat',
  'fsync',
  'ftruncate',
  'futimes',
  'read',
  'readv',
  'write',
  'writev',
]

const mainKeys = [
  ...baseKeys,
  ...baseKeys.map((name) => `${name}Sync`),
  'createReadStream',
  'createWriteStream',
  'watch',
  'watchFile',
  'unwatchFile',
]

const err = (key, file) => {
  const info = file ? `\n  (trying to access ${file})` : ''
  throw new Error(`fs.${key} unsupported in bundled mode${info}`)
}

const stubs = Object.fromEntries(mainKeys.map((key) => [key, () => err(key)]))
const stubsPromises = Object.fromEntries(promisesKeys.map((key) => [key, async () => err(key)]))
const promises = { ...stubsPromises, constants }

// eslint-disable-next-line no-undef
const fsFiles = typeof EXODUS_TEST_FSFILES === 'undefined' ? null : new Set(EXODUS_TEST_FSFILES)
const existsSync = (file) => {
  if (fsFiles?.has(file) || fsFilesContents?.has(file)) return true
  err('existsSync', file)
}

const fsFilesContents =
  // eslint-disable-next-line no-undef
  typeof EXODUS_TEST_FSFILES_CONTENTS === 'undefined' ? null : new Map(EXODUS_TEST_FSFILES_CONTENTS)
const readFileSync = (file, options) => {
  let encoding
  if (typeof options === 'string') {
    encoding = options
  } else if (options !== undefined) {
    if (typeof options !== 'object') throw new Error('Unexpected readFileSync options')
    const { encoding: enc, ...rest } = options
    if (enc !== undefined && typeof enc !== 'string') throw new Error('encoding should be a string')
    encoding = enc
    if (Object.keys(rest).length > 0) throw new Error('Unsupported readFileSync options')
  }

  if (typeof file !== 'string') throw new Error('file argument should be string')
  file = resolve(process.cwd(), file)
  if (fsFilesContents?.has(file)) {
    const data = Buffer.from(fsFilesContents.get(file), 'base64')
    if (encoding?.toLowerCase().replace('-', '') === 'utf8') return data.toString('utf8')
    if (encoding === undefined) return data
    throw new Error('Unsupported encoding')
  }

  err('readFileSync', file)
}

module.exports = { ...stubs, existsSync, readFileSync, promises, constants, F_OK, R_OK, W_OK, X_OK }
