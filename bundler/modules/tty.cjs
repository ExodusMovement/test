module.exports = {
  isatty: () => false,
  // Not arrows as those are classes and can be called with new
  ReadStream() {
    throw new Error('tty.ReadStream unsupported in bundled mode')
  },
  WriteStream() {
    throw new Error('tty.WriteStream unsupported in bundled mode')
  },
}
