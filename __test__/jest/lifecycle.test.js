// Order of describe vs tests is checked
// Order of hooks vs tests is checked

// Relative order of hooks vs code in describes is not matched - Jest executes describe blocks before hooks
// Running *Each hooks in `describe { decribe { *Each; test }; *Each } }` is also not matched
// This is not ideal and perhaps some of it has to be fixed in Node or us

// Prior to 20.13, relative afterEach order was not matched
// Prior to 18.19.0 / 20.8.0, lifecycle was significantly broken, so we don't run on those

const hooklog = []
const testlog = []

afterAll(() => {
  // console.log(testlog)
  // console.log(hooklog)

  // Flatten for readability
  const prettyJson = (line) => line.replaceAll('"', '').replaceAll(/([:,])/gu, '$1 ')
  const flatten = (x) => x.map((line) => prettyJson(JSON.stringify(line)))
  expect(flatten(testlog)).toMatchSnapshot()
  expect(hooklog.length).toMatchSnapshot()
  expect(flatten(hooklog.filter((x) => x.method !== 'afterEach'))).toMatchSnapshot()

  const isNodeVersionOk = () => {
    const [major, minor] = process.versions.node.split('.').map(Number)
    return major > 20 || (major === 20 && minor >= 13)
  }

  if (!jest.exodus || jest.exodus.features.engine !== 'node:test' || isNodeVersionOk()) {
    // See comment on top
    expect(flatten(hooklog)).toMatchSnapshot()
  }
})

let i = 0 // automatic install order

// site is manual localtion site to be not affected by automatic order
function install(f, site) {
  const installOrder = i++
  f(() => hooklog.push({ site, installOrder, method: f.name }))
}

const enter = (name) => testlog.push({ enter: name })
const exit = (name) => testlog.push({ exit: name })
const run = (name) => {
  hooklog.push({ run: name })
  testlog.push({ run: name })
}

const callsite = (name, args) => {
  hooklog.push({ callsite: name, ...args })
  testlog.push({ callsite: name, ...args })
}

const installBunch = (site, opts = {}) => {
  callsite('installBunch', { site })
  install(afterAll, site)
  if (!opts.skipBeforeAll) install(beforeAll, site)
  if (!opts.skipEach) install(beforeEach, site)
  if (!opts.skipEach) install(afterEach, site)
  if (!opts.skipBeforeAll) install(beforeAll, site)
  if (!opts.skipEach) install(afterEach, site)
  if (!opts.skipEach) install(beforeEach, site)
  install(afterAll, site)
}

installBunch(0, { skipBeforeAll: true }) // Node executes this beforeAll before describe blocks, Jest before tests start

describe('A', () => {
  enter('A')
  installBunch(1)

  describe('B', () => {
    enter('B')
    installBunch(2)
    test('C', () => run('C'))
    installBunch(3)
    test('D', () => run('D'))
    exit('B')
  })

  describe('E', () => {
    enter('E')
    installBunch(4)
    test('F', () => run('F'))
    installBunch(5)
    describe('G', () => {
      enter('G')
      installBunch(6)
      test('H', () => run('H'))
      installBunch(7)
      exit('G')
    })
    exit('E')
  })

  installBunch(8, { skipEach: true }) // See comment above

  test('I', () => run('I'))
  exit('A')
})

test('J', () => run('J'))

describe('K', () => {
  enter('K')
  installBunch(9)
  test('L', () => run('L'))
  installBunch(10)
  exit('K')
})
