// Taken from https://jestjs.io/docs/expect

function drinkAll(callback, flavour) {
  if (flavour !== 'octopus') {
    callback(flavour)
  }
}

describe('drinkAll', () => {
  test('drinks something lemon-flavoured', () => {
    const drink = jest.fn()
    drinkAll(drink, 'lemon')
    expect(drink).toHaveBeenCalled()
  })

  test('does not drink something octopus-flavoured', () => {
    const drink = jest.fn()
    drinkAll(drink, 'octopus')
    expect(drink).not.toHaveBeenCalled()
  })
})

describe('drinkEach', () => {
  // added for the example to work
  const drinkEach = (fn, arr) => arr.map((x) => fn(x))

  test('drinkEach drinks each drink', () => {
    const drink = jest.fn()
    drinkEach(drink, ['lemon', 'octopus'])
    expect(drink).toHaveBeenCalledTimes(2)
  })
})

describe('toHaveBeenCalledWith', () => {
  // added for the example to work
  class LaCroix extends Error {}
  const beverages = []
  const register = (arg) => beverages.push(arg)
  const applyToAll = (fn) => beverages.forEach((x) => fn(x))

  test('registration applies correctly to orange La Croix', () => {
    const beverage = new LaCroix('orange')
    register(beverage)
    const f = jest.fn()
    expect(f).not.toHaveBeenCalledWith(beverage) // added
    applyToAll(f)
    expect(f).toHaveBeenCalledWith(beverage)
  })
})

describe('toHaveBeenLastCalledWith', () => {
  // added for the example to work
  const applyToAllFlavors = (fn) => ['orange', 'strawberry', 'mango'].map((x) => fn(x))

  test('applying to all flavors does mango last', () => {
    const drink = jest.fn()
    expect(drink).not.toHaveBeenLastCalledWith('mango') // added
    applyToAllFlavors(drink)
    expect(drink).toHaveBeenLastCalledWith('mango')
    expect(drink).not.toHaveBeenLastCalledWith('orange') // added
  })
})
