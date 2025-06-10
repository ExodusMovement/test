let expect
let assertionsDelta = 0
const extend = []
const set = []

function fixupAssertions() {
  if (assertionsDelta === 0) return
  const state = expect.getState()
  state.assertionCalls += assertionsDelta
  state.numPassingAsserts += assertionsDelta
  assertionsDelta = 0
}

function loadExpect(loadReason) {
  if (expect) return expect
  try {
    expect = require('expect').expect
  } catch {
    throw new Error(`Failed to load 'expect', required for ${loadReason}`)
  }

  // console.log('expect load reason:', loadReason)
  try {
    expect.extend(require('jest-extended'))
  } catch {}

  for (const x of extend) expect.extend(...x)
  for (const [key, value] of set) expect[key] = value
  fixupAssertions()
  return expect
}

const areNumeric = (...args) => args.every((a) => typeof a === 'number' || typeof a === 'bigint')

const matchers = {
  __proto__: null,
  toBe: (x, y) => Object.is(x, y),
  toBeNull: (x) => x === null,
  toBeTruthy: (x) => x,
  toBeFalsy: (x) => !x,
  toBeTrue: (x) => x === true,
  toBeFalse: (x) => x === false,
  toBeDefined: (x) => x !== undefined,
  toBeUndefined: (x) => x === undefined,
  toBeInstanceOf: (x, y) => y && x instanceof y,
  toBeString: (x) => typeof x === 'string' || x instanceof String,
  toBeNumber: (x) => typeof x === 'number', // yes, mismatches toBeString logic. yes, no bigints
  toBeArray: (x) => Array.isArray(x),
  toBeArrayOfSize: (x, l) => Array.isArray(x) && x.length === l,
  toHaveLength: (x, l) => x && x.length === l,
  toBeGreaterThan: (x, c) => areNumeric(x, c) && x > c,
  toBeGreaterThanOrEqual: (x, c) => areNumeric(x, c) && x >= c,
  toBeLessThan: (x, c) => areNumeric(x, c) && x < c,
  toBeLessThanOrEqual: (x, c) => areNumeric(x, c) && x <= c,
  toHaveBeenCalled: (x) => x?._isMockFunction && x?.mock?.calls?.length > 0,
  toHaveBeenCalledTimes: (x, c) => x?._isMockFunction && x?.mock?.calls?.length === c,
  toBeCalled: (...a) => matchers.toHaveBeenCalled(...a),
  toBeCalledTimes: (...a) => matchers.toHaveBeenCalledTimes(...a),
  toHaveBeenCalledOnce: (x) => matchers.toHaveBeenCalledTimes(x, 1),
}

const matchersFalseNegative = {
  __proto__: null,
  toEqual: (x, y) => Object.is(x, y),
  toStrictEqual: (x, y) => Object.is(x, y),
  toContain: (x, c) => Array.isArray(x) && [...x].includes(c),
  toBeEven: (x) => Number.isSafeInteger(x) && x % 2 === 0,
  toBeOdd: (x) => Number.isSafeInteger(x) && x % 2 === 1,
}

const doesNotThrow = (x) => {
  try {
    x()
    return [true]
  } catch (err) {
    return [false, err]
  }
}

const wrapAssertion = (f) => {
  const wrapped = (...args) => {
    if (!Error.captureStackTrace) return f(...args)
    try {
      return f(...args)
    } catch (err) {
      Error.captureStackTrace(err, wrapped)
      throw err
    }
  }

  return wrapped
}

function createExpect() {
  return new Proxy(() => {}, {
    apply: (target, that, [x, ...rest]) => {
      if (rest.length > 0) return loadExpect('rest')(x, ...rest)
      return new Proxy(Object.create(null), {
        get: (_, name) => {
          const matcher = matchers[name] || matchersFalseNegative[name]
          if (matcher) {
            return wrapAssertion((...args) => {
              if (!matcher(x, ...args)) return loadExpect(`.${name} check`)(x)[name](...args)
              assertionsDelta++
            })
          }

          if (name === 'toThrow') {
            return wrapAssertion((...args) => {
              if (args.length > 0) return loadExpect('.toThrow args')(x)[name](...args)
              const [passed] = doesNotThrow(x)
              if (passed) return loadExpect('.toThrow fail')(() => {})[name](...args)
              assertionsDelta++
            })
          }

          if (name === 'not')
            return new Proxy(Object.create(null), {
              get: (_, not) => {
                if (not === 'toThrow') {
                  return wrapAssertion((...args) => {
                    const [passed, err] = doesNotThrow(x)
                    if (!passed) {
                      return loadExpect('.not.toThrow fail')(() => {
                        throw err
                      }).not.toThrow(...args)
                    }

                    assertionsDelta++
                  })
                }

                if (matchers[not]) {
                  return wrapAssertion((...args) => {
                    if (matchers[not](x, ...args)) {
                      return loadExpect(`.not.${not} fail`)(x).not[not](...args)
                    }

                    assertionsDelta++
                  })
                }

                return loadExpect(`.not.${not}`)(x).not[not]
              },
            })

          return loadExpect(`.${name}`)(x)[name]
        },
      })
    },
    get: (_, name) => {
      if (name === 'extend' && !expect) return (...args) => extend.push(args)
      if (name === 'extractExpectedAssertionsErrors') {
        return expect
          ? (...args) => {
              fixupAssertions()
              return expect[name](...args)
            }
          : () => {
              assertionsDelta = 0
              return [] // no .assertions call were made, those cause loading
            }
      }

      return loadExpect(`get ${name}`)[name]
    },
    set: (_, name, value) => {
      if (expect) {
        expect[name] = value
      } else {
        set.push([name, value])
      }

      return true
    },
  })
}

exports.expect = createExpect()
exports.loadExpect = loadExpect
