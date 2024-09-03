// https://jestjs.io/docs/asynchronous#callbacks

function fetchData(x, callback) {
  setTimeout(() => {
    if (x === 1) return callback(undefined, 'peanut butter')
    callback(new Error('there was an error retrieving data'))
  }, 100)
}

test('the data is peanut butter', (done) => {
  function callback(error, data) {
    if (error) {
      done(error)
      return
    }

    try {
      expect(data).toBe('peanut butter')
      done()
    } catch (error) {
      done(error)
    }
  }

  fetchData(1, callback)
})
