const patterms = process.env.EXODUS_TEST_ESBUILD.split(',')
const shouldLoadFile = (file) => patterms.some((ext) => file.endsWith(ext))
if (process.argv.slice(1).some((file) => shouldLoadFile(file))) {
  await import('tsx') // eslint-disable-line @exodus/import/no-unresolved
  globalThis.EXODUS_TEST_INSIDE_ESBUILD = true
}
