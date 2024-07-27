/* eslint-disable unicorn/prefer-top-level-await */

// This test passes in both jest and node:test, while being completely wrong
// Not much what we can do here
// Proper lint setup should catch this instead

async function main() {
  describe('this should pass', () => {
    test('first', async () => {
      // pass
    })
  })

  await new Promise(() => {})

  test('second, unreachable', async () => {
    throw new Error('error')
  })
}

main()
