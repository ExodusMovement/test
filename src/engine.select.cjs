// Needs to be inlined for bundler to optimize it out correctly
module.exports =
  process.env.EXODUS_TEST_CONTEXT === 'pure'
    ? require('./engine.pure.cjs')
    : require('./engine.node.cjs')
