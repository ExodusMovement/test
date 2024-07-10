const fs = require('fs')

jest.mock('fs')

test('should do a transparent fs mock', () => {
  const uuid = crypto.randomUUID()
  expect(fs.existsSync).not.toHaveBeenCalledWith(uuid)
  expect(fs.existsSync(uuid)).toBe(false)
  expect(fs.existsSync).toHaveBeenCalledWith(uuid)
})
