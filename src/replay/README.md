# Record/replay `fetch` and `WebSocket` sessions

For offline testing

These implementations are not specific to `@exodus/test` and can be used separately

Zero-dependencies and bundleable

Replayers can run in V8 / JavaScriptCore / Hermes even with no network API implemented at all

```js
import { fetchRecorder, fetchReplayer, WebSocketRecorder, WebSocketReplayer, prettyJSON } from ...
```

### `fetchRecorder(log[, { fetch }])`

Returns a `fetch` implementation that appends all requests to the provided `log` array

`log` is expected to be an array and is mutated by appending new requests

If a base `fetch` implementation is not passed, global `fetch` is used as the base

That can be overriden, e.g. `fetchRecorder(log, { fetch: require('node-fetch') })`

### `fetchReplayer(log)`

Returns a `fetch` implementation that replies with requests from the provided `log` array

Requests are served by "first matching" order and are discarded from an internal log clone

`log` is expected to be an array and is not mutated

### `WebSocketRecorder(log[, { WebSocket }])`

Returns a `WebSocket` implementation that appends all sessions to the provided `log` array

`log` is expected to be an array and is mutated by appending new sessions

If a base `WebSocket` implementation is not passed, global `WebSocket` is used as the base

That can be overriden, e.g. `WebSocketRecorder(log, { WebSocket: require('ws') })`

### `WebSocketReplayer(log[, { interval = 0 }])`

Returns a `WebSocket` implementation that replies with sessions from the provided `log` array

Sessions are served by "first matching" order and are discarded from an internal log clone

`log` is expected to be an array and is not mutated

Optionally, `interval` can be used to control replay speed:

- `interval = 0` for immediate event firing without delays (default)

- `interval = Infinity` for event timing matching the original recording

- `interval = number` for delay between events of `Math.min(number, recorededDelay)`

### `prettyJSON(data, { sortKeys = false, width = 120 })`

Use it to pretty-print logs: `prettyJSON(log)`

Like `JSON.stringify()`, but with pretty-printing for readability and ease if inspection

The output is parse-able with `JSON.parse()`

For simplicity, fitting into `width` is not guaranteed, but the output is stable between runs

Optionally, sort object keys: `sortKeys = true` (default to false) <- this will mutate responses!\
`sortKeys` support is added mostly not for logs, but for formatting e.g. request options.
