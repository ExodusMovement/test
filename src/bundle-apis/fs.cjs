const constants = require('constants-browserify')
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
  if (fsFiles.has(file)) return true
  err('existsSync', file)
}

const readFileSync = (file /*, options */) => {
  err('readFileSync', file)
}

module.exports = { ...stubs, existsSync, readFileSync, promises, constants, F_OK, R_OK, W_OK, X_OK }
