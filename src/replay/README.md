# Record/replay `fetch` and `WebSocket` sessions

For offline testing

These implementations are not specific to `@exodus/test` and can be used separately

Zero-dependencies, bundleable

Replayers can run in V8 / JavaScriptCore / Hermes even with no network API implemented at all

```js
import { fetchRecorder, fetchReplayer, WebSocketRecorder, WebSocketReplayer, prettyJSON } from ...
```

Generated logs [are human-readable](#samples)

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

### `prettyJSON(data, { width = 120 })`

Use it to pretty-print logs: `prettyJSON(log)`

Like `JSON.stringify()`, but with pretty-printing for readability and ease if inspection

The output is parse-able with `JSON.parse()`

For simplicity, fitting into `width` is not guaranteed, but the output is stable between runs

## Samples

### `fetch` recording

```json
{
  "request": {
    "resource": "https://jsonplaceholder.typicode.com/users/2",
    "options": { "headers": [["accept", "application/json"]] }
  },
  "status": 200,
  "statusText": "OK",
  "ok": true,
  "headers": [
    ...
    ["connection", "keep-alive"],
    ["content-encoding", "br"],
    ["content-type", "application/json; charset=utf-8"],
    ["date", "Sat, 03 Aug 2024 16:57:51 GMT"],
    ...
  ],
  "url": "https://jsonplaceholder.typicode.com/users/2",
  "redirected": false,
  "type": "basic",
  "bodyType": "json",
  "body": {
    "id": 2,
    "name": "Ervin Howell",
    "username": "Antonette",
    "email": "Shanna@melissa.tv",
    "address": {
      "street": "Victor Plains",
      "suite": "Suite 879",
      "city": "Wisokyburgh",
      "zipcode": "90566-7771",
      "geo": { "lat": "-43.9509", "lng": "-34.4618" }
    },
    "phone": "010-692-6593 x09125",
    "website": "anastasia.net",
    "company": {
      "name": "Deckow-Crist",
      "catchPhrase": "Proactive didactic contingency",
      "bs": "synergize scalable supply-chains"
    }
  }
}
```

### `WebSocket` recording

```json
{
  "url": "wss://javascript.info/article/websocket/demo/hello",
  "log": [
    { "type": "get readyState", "at": 24, "value": 0 },
    { "type": "open", "at": 426 },
    { "type": "get readyState", "at": 426, "value": 1 },
    { "type": "get bufferedAmount", "at": 427, "value": 0 },
    { "type": "send()", "at": 427, "data": "Hi there" },
    { "type": "get bufferedAmount", "at": 427, "value": 8 },
    { "type": "message", "at": 543, "data": "Hello from server, there!" },
    { "type": "close()", "at": 543 },
    { "type": "get readyState", "at": 543, "value": 2 },
    { "type": "close", "at": 661, "code": 1005, "reason": "", "wasClean": true },
    { "type": "get readyState", "at": 661, "value": 3 }
  ]
}
```
