const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

let total = 0

const shouldHaveConcurrency = !jest.exodus || jest.exodus.features.concurrency

afterAll(() => {
  if (shouldHaveConcurrency) {
    expect(total).toBe(4)
  }
})

const describeMaybe = shouldHaveConcurrency ? describe : describe.skip

describeMaybe('concurrent', () => {
  let i = 0
  test.concurrent('one (default concurrency)', async () => {
    total++
    i++
    await sleep(50)
    expect(i).toBe(2)
    await sleep(50)
    i--
  })
  test.concurrent('two (default concurrency)', async () => {
    total++
    i++
    await sleep(50)
    expect(i).toBe(2)
    await sleep(50)
    i--
  })

  let j = 0
  test('three (concurrency 1)', async () => {
    total++
    j++
    await sleep(50)
    expect(j).toBe(1)
    await sleep(50)
    j--
  })
  test('four (concurrency 1)', async () => {
    total++
    j++
    await sleep(50)
    expect(j).toBe(1)
    await sleep(50)
    j--
  })
})
