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

export class ErrorWithStack extends Error {
  constructor(message, callsite, stackLimit) {
    if (stackLimit !== undefined) throw new Error('Unexpected usage') // 'expect' doesn't use this
    super(message)
    Error.captureStackTrace?.(this, callsite)
  }
}
