describe('import esm from cjs', () => {
  const mock = () => jest.mock('../../fixtures/esm.js', () => ({ x: 20, __esModule: true }))

  const have = jest.exodus?.features.esmMocks
  const flaky = !have && jest.exodus?.features.esmInterop // we should just kill support for hacky mocks on esmInterop
  const testYes = have ? test : test.skip
  const testNo = !have && !flaky ? test : test.skip

  testNo('throws when ESM mocks are not supported and not flaky', async () => {
    expect(mock).toThrow()
  })

  testYes('works when ESM mocks are supported', async () => {
    mock()
    const object = await import('../../fixtures/esm.js')
    expect(object.x).toBe(20)
    expect(object.original).toBe(undefined)
  })
})
