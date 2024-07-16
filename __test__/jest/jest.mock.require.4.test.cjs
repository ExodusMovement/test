const fs = require('fs')

jest.mock('fs')

test('should do an opaque fs mock', () => {
  const uuid = crypto.randomUUID()
  expect(fs.existsSync).not.toHaveBeenCalledWith(uuid)
  expect(fs.existsSync(uuid)).toBe(undefined)
  expect(fs.existsSync).toHaveBeenCalledWith(uuid)
})
