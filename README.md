# @exodus/test

Most likely it will just work on your simple jest tests as as drop-in replacement

## Library

### Moving from jest

`import { describe, it, assert, jest, expect } from '@exodus/test'`

### Moving from tap/tape

`import { tap as test } from '@exodus/test'`

Not all features might be supported

### Running tests asynchronously

Add `{ concurrency: true }`, like this: `describe('my testsuite', { concurrency: true }, () => {`

### List of exports

Adapters:

- `jest` -- jest mock adapter
- `tap` -- tap/tape adapter
- `mock`

Assertions:

- `assert` -- alias for `node:assert/strict`
- `expect` -- expect with additional features for function mocks

Suite:

- `describe`
- `test`
- `it` -- alias for `test`
- `beforeEach`
- `afterEach`
- `before` -- alias for `beforeAll`
- `after` -- alias for `afterAll`

## Binary

Just use `"test: "exodus-test"`

### Options

- `--global` -- register all test helpers as global variables

- `--typescript` -- enable typescript support

- `--babel` -- enable babel support

- `--coverage` -- enable coverage, prints coverage output (varies by coverage engine)

- `--coverage-engine c8` -- use c8 coverage engine (default), also generates `./coverage/` dirs

- `--coverage-engine node` -- use Node.js builtint coverage engine
