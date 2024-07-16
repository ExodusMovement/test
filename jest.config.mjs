// From bin/index.js defaults
const EXTS = `.?([cm])[jt]s?(x)` // we differ from jest, allowing [cm] before everything
const DEFAULT_PATTERNS = [`**/__tests__/**/*${EXTS}`, `**/?(*.)+(spec|test)${EXTS}`]

export default {
  testMatch: DEFAULT_PATTERNS,
}
