import { inspect } from 'node:util'

const colors = new Map(Object.entries(inspect.colors))
const { CI, FORCE_COLOR } = process.env
const CI_COLORS = CI && !FORCE_COLOR /// when not overriden via FORCE_COLOR, assume CI has colors even though not a tty
export const haveColors = CI_COLORS || process.stdout.hasColors?.() || FORCE_COLOR === '1' // 0 is already handled by hasColors()
export const dim = CI ? 'gray' : 'dim'

export const color = (text, color) => {
  if (!haveColors || text === '') return text
  if (!colors.has(color)) throw new Error(`Unknown color: ${color}`)
  const [start, end] = colors.get(color)
  return `\x1B[${start}m${text}\x1B[${end}m`
}
