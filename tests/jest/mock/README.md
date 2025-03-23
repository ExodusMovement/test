# Jest mode-specific require mock tests

Simply naming files `.cjs` works for `@exodus/test`,
but in Jest the behavior of those differs from `.js` files in CommonJS mode.

This directory is labeled as `commonjs` to run those tests and compare with Jest in CommonJS mode.

Also, some tests require to be explicitly labeled as `.mjs` in Jest -- those are also placed here.
`@exodus/test` would work on those even if those are named `.js` and the project is in ESM mode.
