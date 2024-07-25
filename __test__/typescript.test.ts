import { sum } from './typescript.ts'

describe('typescript', () => {
  test('simple number', () => {
    const times2 = (x: number): number => x * 2
    expect(times2(50)).toBe(100)
  })

  test('object spread is undamaged', () => {
    const x = JSON.parse('{"__proto__":[]}')
    const y = { ...x }
    expect(Object.getPrototypeOf(y)).toBe(Object.prototype)
    // eslint-disable-next-line no-proto
    expect(y.__proto__).not.toBe(Object.getPrototypeOf(y))
    // eslint-disable-next-line no-proto
    expect(Array.isArray(y.__proto__)).toBe(true)
    // eslint-disable-next-line no-proto
    expect(y.__proto__).toBe(x.__proto__)
  })

  test('sum works', () => {
    expect(sum(20, 22)).toBe(42)
  })
})
