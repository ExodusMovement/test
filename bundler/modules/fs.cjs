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

const decode = (source, sourceEncoding, encoding) => {
  if (encoding && sourceEncoding === encoding) return source
  const data = Buffer.from(source, sourceEncoding)
  return encoding === undefined ? data : data.toString(encoding)
}

const getOptions = (arg, options) => {
  if (typeof arg !== 'string') throw new Error('first argument should be string')
  const file = resolve(process.cwd(), arg)
  if (typeof options === 'string') return { file, encoding: options, rest: {} }
  if (options === undefined) return { file, rest: {} }
  if (typeof options !== 'object') throw new Error('Unexpected options')
  const { encoding: enc, ...rest } = options
  if (enc !== undefined && typeof enc !== 'string') throw new Error('encoding should be a string')
  return { file, encoding: enc, rest }
}

const fsFilesContents =
  // eslint-disable-next-line no-undef
  typeof EXODUS_TEST_FSFILES_CONTENTS === 'undefined' ? null : new Map(EXODUS_TEST_FSFILES_CONTENTS)
const readFileSync = (arg, options) => {
  const { file, encoding, rest } = getOptions(arg, options)
  if (Object.keys(rest).length > 0) throw new Error('Unsupported readFileSync options')
  if (fsFilesContents?.has(file)) return decode(fsFilesContents.get(file), 'base64', encoding)
  err('readFileSync', file)
}

// eslint-disable-next-line no-undef
const fsDir = typeof EXODUS_TEST_FSDIRS === 'undefined' ? null : new Map(EXODUS_TEST_FSDIRS)
const readdirSync = (arg, options) => {
  const { file: dir, encoding, rest } = getOptions(arg, options)
  if (Object.keys(rest).length > 0) throw new Error('Unsupported readdirSync options')
  const enc = encoding === 'buffer' ? undefined : encoding || 'utf8'
  if (fsDir?.has(dir)) return fsDir.get(dir).map((name) => decode(name, 'utf8', enc))
  err('readdirSync', dir)
}

// eslint-disable-next-line no-undef
const fsFiles = typeof EXODUS_TEST_FSFILES === 'undefined' ? null : new Set(EXODUS_TEST_FSFILES)
const existsSync = (file) => {
  if (fsFiles?.has(file) || fsFilesContents?.has(file) || fsDir?.has(file)) return true
  err('existsSync', file)
}

const implemented = { existsSync, readFileSync, readdirSync }
module.exports = { ...stubs, ...implemented, promises, constants, F_OK, R_OK, W_OK, X_OK }
