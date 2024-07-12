import { mock } from 'node:test'
import assert from 'node:assert/strict'

const registry = new Set()
let callId = 0

const applyAllWrap = (method) =>
  function () {
    assert(['mockClear', 'mockReset', 'mockRestore'].includes(method))
    for (const obj of registry) obj[method]()
    return this
  }

export const allMocks = {
  clearAllMocks: applyAllWrap('mockClear'),
  resetAllMocks: applyAllWrap('mockReset'),
  restoreAllMocks: applyAllWrap('mockRestore'),
}

// We need parent and property for jest.spyOn and mockfn.mockRestore()
export const jestfn = (baseimpl, parent, property) => {
  // not an arrow as might be used as a constructor
  // also, should be isolated between jest.fn calls
  const noop = function () {}

  let mockname
  let mockimpl = baseimpl || noop
  let reportedmockimpl = baseimpl || undefined
  const onceStack = []

  const fn = mock.fn(function (...args) {
    const impl = onceStack.shift() || mockimpl
    jestfnmock.invocationCallOrder.push(++callId)
    return impl.call(this, ...args)
  })
  const fnmock = fn.mock

  const queuedMockClear = () => fnmock.resetCalls()
  const queuedMockReset = () => {
    queuedMockClear()
    onceStack.length = 0
    mockimpl = noop
    mockname = undefined
    reportedmockimpl = undefined
  }

  const queuedMockRestore = () => {
    queuedMockReset()
    // mocked function resets to noop, the original resets to baseimpl
    if (parent && property) {
      assert(property in parent && !(property in {}) && !(property in Object.prototype))
      if (parent[property] === fnproxy) {
        // we need to handle the case when that came from prototype
        // eslint-disable-next-line @exodus/mutable/no-param-reassign-prop-only
        delete parent[property]
        // eslint-disable-next-line @exodus/mutable/no-param-reassign-prop-only
        if (parent[property] !== baseimpl) parent[property] = baseimpl
      }
    }
  }

  const queuedMock = (impl) => {
    mockimpl = impl || noop
    onceStack.length = 0
  }

  // getMockImplementation() is undocumented and is changed only in real mockImplementation() call
  const queuedMockReported = (impl) => {
    queuedMock(impl)
    reportedmockimpl = impl
  }

  const queuedMockOnce = (impl) => {
    onceStack.push(impl)
  }

  const jestfnmock = {
    invocationCallOrder: [],
    get calls() {
      return fnmock.calls.map((call) => call.arguments)
    },
    get results() {
      return fnmock.calls.map((call) =>
        call.error ? { type: 'throw', value: call.error } : { type: 'return', value: call.result }
      )
    },
    get instances() {
      return fnmock.calls.map((call) => {
        // only return valid instances
        assert(call.result && call.result === call.this)
        return call.this
      })
    },
    get contexts() {
      return fnmock.calls.map((call) => call.this)
    },
    get lastCall() {
      return fnmock.calls.at(-1)?.arguments
    },
  }

  const fnProxyGet = (obj, key) => {
    const wrap =
      (body) =>
      (...args) => {
        body(...args)
        return fnproxy
      }

    if (Object.hasOwn(obj, key)) return obj[key]

    switch (key) {
      case 'bind':
        // No need to add this to the registy as we already have the base instance
        return (...args) => new Proxy(obj.bind(...args), { get: fnProxyGet })
      case 'mock':
        return jestfnmock
      case '_isMockFunction':
        return true
      case 'getMockName':
        return () => mockname ?? 'jest.fn()'
      case 'mockName':
        return wrap((name) => {
          mockname = name
        })
      case 'getMockImplementation':
        return () => reportedmockimpl
      case 'mockClear':
        return wrap(() => queuedMockClear())
      case 'mockReset':
        return wrap(() => queuedMockReset())
      case 'mockRestore':
        return wrap(() => queuedMockRestore())
      case 'mockImplementation':
        return wrap((impl) => queuedMockReported(impl))
      case 'mockImplementationOnce':
        return wrap((impl) => queuedMockOnce(impl))
      case 'mockReturnValue':
        return wrap((val) => queuedMock(() => val))
      case 'mockReturnValueOnce':
        return wrap((val) => queuedMockOnce(() => val))
      case 'mockResolvedValue':
        return wrap((val) => queuedMock(() => Promise.resolve(val)))
      case 'mockResolvedValueOnce':
        return wrap((val) => queuedMockOnce(() => Promise.resolve(val)))
      case 'mockRejectedValue':
        return wrap((val) => queuedMock(() => Promise.reject(val)))
      case 'mockRejectedValueOnce':
        return wrap((val) => queuedMockOnce(() => Promise.reject(val)))
    }

    return obj[key]
  }

  const fnproxy = new Proxy(fn, { get: fnProxyGet })
  registry.add(fnproxy)

  return fnproxy
}
