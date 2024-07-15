const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

describe('concurrent', () => {
  let i = 0
  test.concurrent('one (default concurrency)', async () => {
    i++
    await sleep(50)
    expect(i).toBe(2)
    await sleep(50)
    i--
  })
  test.concurrent('two (default concurrency)', async () => {
    i++
    await sleep(50)
    expect(i).toBe(2)
    await sleep(50)
    i--
  })

  let j = 0
  test('three (concurrency 1)', async () => {
    j++
    await sleep(50)
    expect(j).toBe(1)
    await sleep(50)
    j--
  })
  test('four (concurrency 1)', async () => {
    j++
    await sleep(50)
    expect(j).toBe(1)
    await sleep(50)
    j--
  })
})
