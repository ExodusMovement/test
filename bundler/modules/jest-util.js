// APIs used in expect()

export const isPromise = (x) => Boolean(x && x.then && x.catch && x.finally)

var NUMS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
]

export const pluralize = (word, count) => `${NUMS[count] || count} ${word}${count === 1 ? '' : 's'}`
