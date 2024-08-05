# @exodus/test

A runner for `node:test`, `jest`, and `tape` test suites on top of `node:test` (and any runtime)

Most likely it will just work on your simple jest tests as as drop-in replacement

Comes with typescript support, optional esm/cjs interop, and also loading babel transforms!

Use `--coverage` to generate coverage output

Default `NODE_ENV` value is "test", use `NODE_ENV=` to override (e.g. to empty)

## Why?

- Can run your tests on Node.js, Bun, Deno, JavaScriptCore and Hermes without extra churn

- Unlike `jest`, it is fast

- Unlike `node:test`, it is a drop-in replacement for `jest`

  - With `expect`, support for snapshots, mocks and matchers

  - `jest-when` and `jest-extended` are fully compatible and can just be used

  - Snapshots are compatible with Jest and can just be used both ways

  - Also compatible to `node:test`

- Unlike `bun:test`, it runs all test files in isolated contexts

  Bun leaks globals / side effects between test files and has incompatible `test()` lifecycle / order

- Can use Jest config

- Native coverage support (enable via `--coverage`)

- Can record / replay `fetch` and `WebSocket` sessions. And run them on all runtimes (including Hermes)

- Automatic polyfills for JavaScriptCore / Hermes, including crypto

- Hanging tests error by default (unlike `jest`)

- Native ESM out of the box

- Esbuild on the fly for babelified ESM interop (enable via `--esbuild`)

- TypeScript support in both transform (enable via `--esbuild`) and typestrip (via `--typescript`) modes

- Babel support, picks up your Babel config (enable via `--babel`)

- `--drop-network` support for guaranteed offline testing

## Library

### Using with `node:test` natively

You can just use pure [`node:test`](https://nodejs.org/api/test.html) in your tests,
this runner is fully compatible with that (and will set version-specific options for you)!

### Moving from jest

```js
import {
  jest,
  expect,
  describe,
  it,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
} from '@exodus/test/jest'
```

Or, run with [`--jest` option](#options) to register jest globals

### Moving from tap/tape

```js
import test from '@exodus/test/tape'
```

### Running tests asynchronously

Add `{ concurrency: true }`, like this: `describe('my testsuite', { concurrency: true }, () => {`

### List of exports

- `@exodus/test/jest` -- `jest` mock

- `@exodus/test/tape` -- `tape` mock (can also be helpful when moving from `tap`)

## Binary

Just use `"test": "exodus-test"`

### Options

- `--jest` -- register jest test helpers as global variables, also load `jest.config.*` configuration options

- `--esbuild` -- use esbuild loader, also enables Typescript support

- `--babel` -- use babel loader (slower than `--esbuild`, makes sense if you have a special config)

- `--coverage` -- enable coverage, prints coverage output (varies by coverage engine)

- `--coverage-engine c8` -- use c8 coverage engine (default), also generates `./coverage/` dirs

- `--coverage-engine node` -- use Node.js builtint coverage engine

- `--watch` -- operate in watch mode and re-run tests on file changes

- `--only` -- only run the tests marked with `test.only`

- `--passWithNoTests` -- do not error when no test files were found

- `--write-snapshots` -- write snapshots instead of verifying them (has `--test-update-snapshots` alias)

- `--test-force-exit` -- force exit after tests are done (useful in integration tests where it could be unfeasible to resolve all open handles)
