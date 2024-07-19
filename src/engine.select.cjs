const context = process.env.EXODUS_TEST_CONTEXT
module.exports = context === 'pure' ? require('./engine.pure.cjs') : require('./engine.node.cjs')
