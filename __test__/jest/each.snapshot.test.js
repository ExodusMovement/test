describe('test.each names and values are correct, as verified by snapshots', () => {
  const iterate = (name, arr) => test.each(arr)(name, (...args) => expect(args).toMatchSnapshot())

  iterate('static', [
    [1, 1, 2],
    [1, 2, 3],
    [2, 1, 3],
  ])

  iterate('%i %s %n', [
    [1, 1, 2],
    [1, 2, 3],
    [2, 1, 3],
  ])

  iterate('A: %i %s %i', [1, [], {}])
  iterate('B: %i %s %n', [[], [], []])
  iterate('C: %i %s %n', [[], [], {}])
  iterate('D: %j %s %n', [[], [{}], [{}]])
  iterate('E: %i %s %n', [[], {}, [{}]])

  iterate('F: $a, $b', [{ a: 1, b: 1 }, { a: NaN }, { b: 42 }, [{ a: 2, b: 5 }]])

  iterate('-F: $a, $b', [[{ a: 2, b: 5 }], { b: 42 }, { a: NaN }, { a: 1, b: 1 }])

  iterate('G: $a, $b', [43, { a: 1, b: 1 }, { a: NaN }, { b: 42 }, [{ a: 2, b: 5 }]])

  iterate('-G: $a, $b', [[{ a: 2, b: 5 }], { b: 42 }, { a: NaN }, { a: 1, b: 1 }, 43])

  iterate('H: $a, $b', [null, { a: 1, b: 1 }, { a: NaN }, { b: 42 }, [{ a: 2, b: 5 }]])

  class X {}
  const x = new X()
  x.b = 20

  iterate('I: $a, $b, $1$0 c,$c0|^@*$mw#o%M@$d ', [
    /y/,
    x,
    {},
    { k: 24 },
    { a: 1, b: 1 },
    [],
    [20, 30],
    { a: NaN },
  ])

  iterate('J: $a, $b', [3, [], { a: 3, b: 1 }, [{ a: 1, b: 2 }]])
})

describe.each`
  a    | b    | expected
  ${1} | ${1} | ${2}
  ${1} | ${2} | ${3}
  ${1} | ${2} | ${3}
  ${2} | ${1} | ${3}
`('$a + $b', (...args) => {
  test(`args are correct`, () => {
    expect(args).toMatchSnapshot()
  })

  const [{ a, b, expected }] = args

  test(`returns ${expected}`, () => {
    expect(a + b).toBe(expected)
  })
})

describe.each([
  [undefined, 0],
  [2, 3],
  [null, false],
])('describe', (...args) => {
  test.each([{}, [300], [undefined, 2]])('name', (...brgs) => {
    expect({ args, brgs }).toMatchSnapshot()
  })
})
