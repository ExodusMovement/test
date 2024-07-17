module.exports = {
  value: 20,
  hello: 'world',
  call: () => 'hi',
  // eslint-disable-next-line no-new-wrappers, unicorn/new-for-builtins
  stringobj: new String('hello'),
  arr: [1, 2, 3],
}
