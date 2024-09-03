async function fetchData(x) {
  await new Promise((resolve) => setTimeout(resolve, 100))
  if (x === 1) return 'peanut butter'
  throw new Error('there was an error retrieving data')
}

// https://jestjs.io/docs/asynchronous#asyncawait
// With minor changes

test('the data is peanut butter', async () => {
  const data = await fetchData(1)
  expect(data).toBe('peanut butter')
})

test('the fetch fails with an error', async () => {
  expect.assertions(1)
  try {
    await fetchData()
  } catch (error) {
    expect(error?.message).toMatch('error')
  }
})

test('the data is peanut butter', async () => {
  await expect(fetchData(1)).resolves.toBe('peanut butter')
})

test('the fetch fails with an error', async () => {
  await expect(fetchData()).rejects.toThrow('error')
})
