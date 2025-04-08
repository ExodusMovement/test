# @exodus/test

A runner for `node:test`, `jest`, and `tape` test suites on top of `node:test` (and any runtime)

## Features

- Native ESM, including in Jest tests
- Esbuild on the fly for babelified ESM interop (enable via `--esbuild`)
- TypeScript support in both transform (through [tsx](https://tsx.is/), enable via `--esbuild`)
  and typestrip (via `--typescript`) modes
- Runs on [node:test](https://nodejs.org/api/test.html), and (experimental) on bun, deno, d8, JSC,
  [Hermes](https://hermesengine.dev), Chrome, Firefox and WebKit.
- Testsuite-agnostic -- can run any file as long as it sets exit code based on test results
- Built-in [Jest](https://jestjs.io) compatibility (with `--jest`), including `jest.*` global
  - Up to ~10x faster depending on the original setup
  - Actual `expect` module, also `jest-extended` and `jest-when` just work on top
  - Snapshots, including snapshot matchers
  - Function and timer mocks
  - [test.concurrent]()
  - Module mocks (on top of Node.js runtime only), including for ESM modules
  - Loads Jest configuration
  - It works on Hermes too!
- Built-in network record/replay for offline tests, mocking `fetch` and `WebSocket` sessions
- `--drop-network` support for guaranteed offline testing
- Native code coverage via v8 (Node.js or [c8](https://github.com/bcoe/c8)), with istanbul reporters
- GitHub reporter (auto-enabled by default)
- JSDOM env support
- Hanging tests error by default (unlike `jest`)
- Babel support, picks up your Babel config (enable via `--babel`)
- Unlike `bun:test`, it runs test files in isolated contexts \
  Bun leaks globals / side effects between test files ([ref](https://github.com/oven-sh/bun/issues/6024)),
  and has incompatible `test()` lifecycle / order
- Also features a tape API for drop-in replacement

## Reporter samples

#### CLI (but uses colors when output supports them, e.g. in terminal):

```console
# tests/jest/expect.mock.test.js
✔ PASS drinkAll > drinks something lemon-flavoured (1.300417ms)
✔ PASS drinkAll > does not drink something octopus-flavoured (0.191791ms)
✔ PASS drinkAll (1.842959ms)
✔ PASS drinkEach > drinkEach drinks each drink (0.360625ms)
✔ PASS drinkEach (0.463416ms)
✔ PASS toHaveBeenCalledWith > registration applies correctly to orange La Croix (0.53325ms)
✔ PASS toHaveBeenCalledWith (0.564166ms)
✔ PASS toHaveBeenLastCalledWith > applying to all flavors does mango last (0.380375ms)
✔ PASS toHaveBeenLastCalledWith (0.473417ms)
# tests/jest/fn.invocationCallOrder.test.js
✔ PASS mock.invocationCallOrder (4.221042ms)
```

#### GitHub Actions collapses test results per-file, like this:

<details>
 <summary>✅ <strong>tests/jest/lifecycle.test.js</strong></summary>
 <pre>
  ✔ PASS A > B > C (3.26166ms)
  ✔ PASS A > B > D (1.699463ms)
  ✔ PASS A > B (6.72719ms)
  ✔ PASS A > E > F (1.117997ms)
  ✔ PASS A > E > G > H (1.330904ms)
  ✔ PASS A > E > G (1.94971ms)
  ✔ PASS A > E (3.821825ms)
  ✔ PASS A > I (0.533096ms)
  ✔ PASS A (13.887889ms)
  ✔ PASS J (0.373187ms)
  ✔ PASS K > L (0.659852ms)
  ✔ PASS K (1.143195ms)
 </pre>
</details><details>
 <summary>✅ <strong>tests/jest/timers.async.test.js</strong></summary>
 <pre>
  ✔ PASS advanceTimersByTime() does not let microtasks to pass (5.326604ms)
  ✔ PASS advanceTimersByTime() does not let microtasks to pass even with await (1.336064ms)
  ✔ PASS advanceTimersByTimeAsync() lets microtasks to pass (6.99526ms)
  ✔ PASS advanceTimersByTimeAsync() lets microtasks to pass, chained (10.131664ms)
  ✔ PASS advanceTimersByTimeAsync() lets microtasks to pass, longer chained (8.635472ms)
  ✔ PASS advanceTimersByTimeAsync() lets microtasks to pass, async chain (56.937983ms)
 </pre>
</details>

See live output in [CI](https://github.com/ExodusMovement/test/actions/workflows/checks.yaml)

## Library

### List of exports

- `@exodus/test/node` -- `node:test` API, working under non-Node.js platforms

- `@exodus/test/jest` -- `jest` implementation

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

## Jest compatibility

The `--jest` mode is mostly compatible with Jest. There are some noteworthy differences though.
This tool does not hoist mocks, so it is important that a mock is defined before the module that uses it is imported.
In ESM, this can be achieved with dynamic imports:

```js
jest.mock('./hogwarts.js', () => {
  return {
    __esModule: true,
    default: jest.fn(),
  }
})

const { default: getEntryQualification } = await import('./hogwarts.js')
const { qualifiesForHogwarts } = await import('./wizard.js') // module importing ./hogwarts.js

test('qualifies for Hogwarts', () => {
  // doSomething is a mock function
  getEntryQualification.mockReturnValue(['lumos'])

  expect(qualifiesForHogwarts('potter')).toBe(false)
  getEntryQualification.mockReturnValue([])
  expect(qualifiesForHogwarts('potter')).toBe(true)
})
```

Note that all modules that transitively import `hogwarts.js` will have to be imported after the mock is defined.

## License

[MIT](./LICENSE)
