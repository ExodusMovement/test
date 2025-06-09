import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

async function getJestConfig(dir) {
  if (!dir) return

  const configPath = (ext) => path.resolve(dir, `jest.config.${ext}`)

  assert(!existsSync(configPath('ts')), 'jest.config.ts is not supported yet with .ts extension')

  const configs = []
  for (const type of ['js', 'ts', 'mjs', 'cjs', 'json']) {
    try {
      if (type === 'json') {
        configs.push(JSON.parse(await readFile(configPath('json'), 'utf8')))
      } else {
        const { default: config } = await import(pathToFileURL(configPath(type)))
        configs.push(config)
      }
    } catch (e) {
      if (!['ERR_MODULE_NOT_FOUND', 'ENOENT'].includes(e.code)) throw e
    }
  }

  try {
    const pkg = JSON.parse(await readFile(path.resolve(dir, 'package.json'), 'utf8'))
    assert(typeof pkg.jest !== 'string', 'String package.json["jest"] values are not supported yet')
    if (pkg.jest) configs.push(pkg.jest)
  } catch (e) {
    if (e.code !== 'ENOENT') throw e
  }

  assert(configs.length < 2, `Multiple jest configs found in ${dir} dir, use only a single one`)

  if (configs.length > 0) {
    const conf = { ...configs[0] }
    if (conf.rootDir && ['.', './'].includes(conf.rootDir)) {
      assert.equal(path.resolve(dir, conf.rootDir), dir, 'Jest config.rootDir is not supported yet')
    }

    conf.rootDir = dir
    return conf
  }

  const parent = path.dirname(dir)
  return parent === dir ? undefined : getJestConfig(parent)
}

const files = process.argv.slice(1)
const baseDir = files.length === 1 ? path.dirname(path.resolve(files[0])) : undefined

export const readJestConfig = async (dir = baseDir) => getJestConfig(dir)
