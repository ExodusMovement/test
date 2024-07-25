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

const err = (key) => {
  throw new Error(`fs.${key} unsupported in bundled mode`)
}

const stubs = Object.fromEntries(mainKeys.map((key) => [key, () => err(key)]))
const stubsPromises = Object.fromEntries(promisesKeys.map((key) => [key, async () => err(key)]))
const promises = { ...stubsPromises, constants }

module.exports = { ...stubs, promises, constants, F_OK, R_OK, W_OK, X_OK }
