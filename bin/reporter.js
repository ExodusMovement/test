import assert from 'node:assert/strict'
import { inspect } from 'node:util'
import { relative } from 'node:path'
import { spec as SpecReporter } from 'node:test/reporters'

const haveColors = process.stdout.hasColors?.() || process.env.FORCE_COLOR === '1' // 0 is already handled by hasColors()
const colors = new Map(Object.entries(inspect.colors))
const reportCI = process.env.CI
const dim = reportCI ? 'gray' : 'dim'

export const color = (text, color) => {
  if (!haveColors || text === '') return text
  if (!colors.has(color)) throw new Error(`Unknown color: ${color}`)
  const [start, end] = colors.get(color)
  return `\x1B[${start}m${text}\x1B[${end}m`
}

// Used for pure engine output formatting
export const format = (chunk) => {
  if (!haveColors) return chunk
  return chunk
    .replaceAll(/^✔ PASS /gmu, color('✔ PASS ', 'green'))
    .replaceAll(/^⏭ SKIP /gmu, color('⏭ SKIP ', dim))
    .replaceAll(/^✖ FAIL /gmu, color('✖ FAIL ', 'red'))
    .replaceAll(/^⚠ WARN /gmu, color('⚠ WARN ', 'blue'))
    .replaceAll(/^‼ FATAL /gmu, `${color('‼', 'red')} ${color(' FATAL ', 'bgRed')} `)
}

export const printSummary = (files, failures) => {
  if (failures.length > 0) {
    const [total, passed, failed] = [files.length, files.length - failures.length, failures.length]
    const failLine = color(`${failed} / ${total}`, 'red')
    const passLine = color(`${passed} / ${total}`, 'green')
    const suffix = passed > 0 ? color(` (passed: ${passLine})`, dim) : ''
    console.log(`${color('Test suites failed:', 'bold')} ${failLine}${suffix}`)
    console.log(color('Failed test suites:', 'red'))
    for (const file of failures) console.log(`  ${file}`) // joining with \n can get truncated, too big
  } else {
    console.log(color(`All ${files.length} test suites passed`, 'green'))
  }
}

export const timeLabel = color('Total time', dim)
export const header = (file) => color(`# ${file}`, 'bold')

export default async function nodeTestReporterExodus(source) {
  const spec = new SpecReporter()
  spec.on('data', (data) => {
    console.log(data.toString('utf8'))
  })

  const files = new Set()
  const failedFiles = new Set()
  const cwd = process.cwd()
  const path = []
  let lastFile
  const formatTime = ({ duration_ms: ms }) => color(` (${ms}ms)`, dim)
  const formatSuffix = (data) => `${formatTime(data.details)}${data.todo ? ' # TODO' : ''}`
  const printHead = (data) => {
    const file = relative(cwd, data.file) // some events have data.file resolved, some not
    if (file === lastFile) return
    lastFile = file
    files.add(file)
    console.log(header(file))
  }

  for await (const { type, data } of source) {
    // Ignored: test:complete (no support on older Node.js), test:plan, test:dequeue, test:enqueue
    switch (type) {
      case 'test:start':
        printHead(data)
        path.push(data.name)
        break
      case 'test:pass':
        if (data.skip) {
          console.log(`${color('⏭ SKIP ', dim)}${path.join(' > ')}${formatSuffix(data)}`)
        } else {
          console.log(`${color('✔ PASS ', 'green')}${path.join(' > ')}${formatSuffix(data)}`)
        }

        assert(path.pop() === data.name)
        break
      case 'test:fail':
        console.log(`${color('✖ FAIL ', 'red')}${path.join(' > ')}${formatSuffix(data)}`)
        assert(path.pop() === data.name)
        if (data.details.error) {
          if (data.details.error.cause) delete data.details.error.cause.matcherResult
          const err = inspect(data.details.error.cause || data.details.error, {
            colors: haveColors,
          })
          console.log(err.replace(/^/gmu, '  '))
          console.log('')
        }

        if (!data.todo) failedFiles.add(relative(cwd, data.file))
        break
      case 'test:watch:drained':
        console.log(color(`ℹ waiting for changes as we are in ---watch mode`, 'blue'))
        break
      case 'test:diagnostic':
        if (/^suites \d+$/.test(data.message)) break // we count suites = files
        console.log(color(`ℹ ${data.message}`, 'blue'))
        break
      case 'test:stderr':
      case 'test:stdout':
        printHead(data)
        console.log(data.message.replace(/\n$/, ''))
        break
      case 'test:coverage':
        spec.write({ type, data }) // let spec reporter handle that
        break
    }
  }

  printSummary([...files], [...failedFiles])
}
