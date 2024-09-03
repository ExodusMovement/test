const keys = 'ChildProcess,exec,execFile,execFileSync,execSync,fork,spawn,spawnSync'.split(',')

const makeMethod = (key) => {
  // Not an arrow as ChildProcess is a class and can be called with new
  return function () {
    throw new Error(`child_process.${key} unsupported in bundled mode`)
  }
}

module.exports = Object.fromEntries(keys.map((key) => [key, makeMethod(key)]))
