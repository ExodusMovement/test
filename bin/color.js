import { inspect } from 'node:util'

const colors = new Map(Object.entries(inspect.colors))
export const haveColors = process.stdout.hasColors?.() || process.env.FORCE_COLOR === '1' // 0 is already handled by hasColors()
export const dim = process.env.CI ? 'gray' : 'dim'

export const color = (text, color) => {
  if (!haveColors || text === '') return text
  if (!colors.has(color)) throw new Error(`Unknown color: ${color}`)
  const [start, end] = colors.get(color)
  return `\x1B[${start}m${text}\x1B[${end}m`
}
