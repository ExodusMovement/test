// For node.js Buffers to have the same ref / be fast
const { Buffer, Blob, File } = globalThis
module.exports = { Buffer, Blob, File, INSPECT_MAX_BYTES: 50, kMaxLength: 2 ** 31 - 1 }
