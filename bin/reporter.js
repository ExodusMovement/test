import assert from 'node:assert/strict'
import { inspect } from 'node:util'
import { relative, resolve } from 'node:path'
import { spec as SpecReporter } from 'node:test/reporters'

const { FORCE_COLOR, CI, GITHUB_WORKSPACE, LERNA_PACKAGE_NAME } = process.env
const haveColors = process.stdout.hasColors?.() || FORCE_COLOR === '1' // 0 is already handled by hasColors()
const colors = new Map(Object.entries(inspect.colors))
const dim = CI ? 'gray' : 'dim'

const uriReplacer = (x) => `%${x.codePointAt(0).toString(16).padStart(2, '0').toUpperCase()}`
const escapeGitHubValue = (k, v) => `${k}=${String(v ?? '').replace(/[%\r\n:,]/gu, uriReplacer)}`
const escapeGitHub = (s) => String(s || 'Unknown error').replace(/[%\r\n]/gu, uriReplacer)
const serializeGitHub = (entries) => entries.map(([k, v]) => escapeGitHubValue(k, v)).join(',')

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

const formatTime = (ms) => (ms ? color(` (${ms}ms)`, dim) : '')
const formatSuffix = (d) => `${formatTime(d.details.duration_ms)}${d.todo ? ' # TODO' : ''}`

const groupCI = CI && !process.execArgv.includes('--watch') && !LERNA_PACKAGE_NAME // lerna+nx groups already
export const timeLabel = color('Total time', dim)
export const head = groupCI ? () => {} : (file) => console.log(color(`# ${file}`, 'bold'))
export const middle = (file, ok, ms) => {
  if (!groupCI) return
  console.log(`::group::${ok ? '✅' : '❌'} ${color(file, 'bold')}${formatTime(ms)}`)
}

export const tail = groupCI ? () => console.log('::endgroup::') : () => {}
export const summary = (files, failures) => {
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

const cleanLine = (line) =>
  line.trimStart().startsWith('at ') ? line.replace(`(file://${GITHUB_WORKSPACE}/`, '(') : line
const cleanWorkspace = (e) => (CI && GITHUB_WORKSPACE ? e.split('\n').map(cleanLine).join('\n') : e)
const SKIPPED_TRACE_LINES =
  /\n^(\x1B\[90m)? +at [ a-zA-Z.]+ \(node:(async_hooks|internal\/test_runner\/test):\d+:\d+\)(\x1B\[39m)?$/gmu // eslint-disable-line no-control-regex
const notPrintedError = (e) => e?.code === 'ERR_TEST_FAILURE' && e?.failureType === 'subtestsFailed' // skipped from printing details
const extractError = ({ details: { error }, ...data }, file) => {
  if (!error) return ''
  if (error.cause) delete error.cause.matcherResult // eslint-disable-line @exodus/mutable/no-param-reassign-prop-only
  const selected = error.cause || error
  const body = inspect(selected, { colors: haveColors }).replaceAll(SKIPPED_TRACE_LINES, '')

  let loc = { file, line: data.line, col: data.column }
  const validLine = (l) => l.startsWith('at ') && l.replace(/:\d+:\d+\)$/, '').endsWith(`/${file}`)
  const line = (selected.stack || '').split('\n').find((l) => validLine(l.trimStart()))
  const match = line?.match(/:(\d+):(\d+)\)$/)
  if (match) loc = { file, line: Number(match[1]), col: Number(match[2]) }

  return { body: cleanWorkspace(body), loc }
}

try {
  // Welp, in some cases there is no other way to tell the entry point
  // E.g. when the test file is just an import of another one, the reported 'file' is the imported one
  // We want to know the original entry points instead
  const runner = await import('node:internal/test_runner/runner') // eslint-disable-line @exodus/import/no-unresolved
  const { FileTest } = runner.default || runner
  const { addToReport } = FileTest.prototype
  FileTest.prototype.addToReport = function (item, ...rest) {
    if (item?.type === 'test:start' && !item.data.entry) {
      item.data.entry = this.loc?.file || (this.name && resolve(this.name)) // eslint-disable-line @exodus/mutable/no-param-reassign-prop-only
    }

    return addToReport.call(this, item, ...rest)
  }
} catch {}

export default async function nodeTestReporterExodus(source) {
  const spec = new SpecReporter()
  spec.on('data', (data) => {
    console.log(data.toString('utf8'))
  })

  const log = []
  const print = (msg) => (groupCI ? log.push(msg) : console.log(msg))
  const dump = () => {
    middle(file, !failedFiles.has(file))
    for (const line of log) console.log(line)
    log.length = 0
    tail()
  }

  const files = new Set()
  const failedFiles = new Set()
  const cwd = process.cwd()
  const path = []
  let file
  const diagnostic = []
  const delayed = []
  const isTopLevelTest = ({ nesting, line, column, name, file }) =>
    nesting === 0 && line === 1 && column === 1 && file.endsWith(name) && resolve(name) === file // some events have data.file resolved, some not)
  const processNewFile = (data) => {
    const newFile = relative(cwd, data.entry || data.file) // some events have data.file resolved, some not
    if (newFile === file) return
    if (file !== undefined) dump()
    file = newFile
    assert(files.has(file), 'Cound not determine file')
    head(file)
  }

  for await (const { type, data } of source) {
    // Ignored: test:complete (no support on older Node.js), test:plan, test:dequeue, test:enqueue
    switch (type) {
      case 'test:dequeue':
        if (data.nesting === 0 && !Object.hasOwn(data, 'file')) files.add(relative(cwd, data.name)) // old-style
        if (isTopLevelTest(data)) files.add(relative(cwd, data.file))
        break
      case 'test:start':
        processNewFile(data)
        path.push(data.name)
        while (delayed.length > 0) print(delayed.shift())
        break
      case 'test:pass':
        const label = data.skip ? color('⏭ SKIP ', dim) : color('✔ PASS ', 'green')
        print(`${label}${path.join(' > ')}${formatSuffix(data)}`)
        assert(path.pop() === data.name)
        break
      case 'test:fail':
        print(`${color('✖ FAIL ', 'red')}${path.join(' > ')}${formatSuffix(data)}`)
        assert(path.pop() === data.name)
        if (!data.todo) failedFiles.add(file)
        if (!notPrintedError(data.details.error)) {
          const { body, loc } = extractError(data, relative(cwd, data.file)) // might be different from current file if in subimport
          if (!data.todo && CI && loc.line != null && loc.col != null) {
            print(`::error ${serializeGitHub(Object.entries(loc))}::${escapeGitHub(body)}`)
          } else if (body) {
            print(`${body.replace(/^/gmu, '  ')}\n`)
          }
        }

        break
      case 'test:watch:drained':
        assert(!groupCI, 'Can not mix --watch with CI grouping')
        console.log(color(`ℹ waiting for changes as we are in --watch mode`, 'blue'))
        break
      case 'test:diagnostic':
        if (/^suites \d+$/.test(data.message)) break // we count suites = files
        diagnostic.push(color(`ℹ ${data.message}`, 'blue'))
        break
      case 'test:stderr':
      case 'test:stdout':
        const handle = path.length > 0 ? print : (arg) => delayed.push(arg)
        handle(data.message.replace(/\n$/, '')) // these are printed at test:start
        break
      case 'test:coverage':
        spec.write({ type, data }) // let spec reporter handle that
        break
    }
  }

  dump()
  for (const line of diagnostic) console.log(line)
  summary([...files], [...failedFiles])
}
