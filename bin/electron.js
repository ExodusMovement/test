import { app, ipcMain, protocol, session, BrowserWindow } from 'electron'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const abort = (message) => {
  if (message) console.error(message)
  app.exit(1)
}

if (process.argv[1] !== import.meta.filename) abort('Unexpected launcher script')
const files = process.argv.slice(2).map((f) => readFile(f, 'utf8'))

// synchronous to ensure we don't miss anything
ipcMain.on('print', (event, args) => {
  console.log(...args)
  event.returnValue = undefined // eslint-disable-line @exodus/mutable/no-param-reassign-prop-only
})

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = true // we don't want Electron CSP warnings
process.on('unhandledRejection', (e) => abort(e))
app.on('window-all-closed', () => abort('Window got closed'))

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'exodustest',
    privileges: { standard: true, secure: true, supportFetchAPI: true }, // has to be standard + secure for crypto
  },
])

const enableIntegration = process.env.EXODUS_TEST_ENGINE === 'electron:pure'
const devtools = process.env.EXODUS_TEST_DEVTOOLS === '1'
const preload = fileURLToPath(import.meta.resolve('./electron.preload.cjs'))
const partition = 'tmp' // not persistent
const securityPreferences = enableIntegration
  ? { sandbox: false, contextIsolation: false, nodeIntegration: true }
  : { sandbox: true, contextIsolation: true, preload }
const webPreferences = { ...securityPreferences, partition, spellcheck: false }
const html = '<!doctype html><html><body></body></html>'
const headers = { 'content-type': 'text/html' }

// eslint-disable-next-line unicorn/prefer-top-level-await
app.whenReady().then(async () => {
  const ses = session.fromPartition(partition)
  ses.protocol.handle('exodustest', () => new Response(html, { headers }))
  const win = new BrowserWindow({ show: devtools, webPreferences })
  if (devtools) win.openDevTools()

  await win.loadURL('exodustest://bundle/')
  await win.webContents.executeJavaScript(`
    const consoleKeys = ['log', 'error', 'warn', 'info', 'debug', 'trace']
    for (const k of consoleKeys) {
      if (!Object.hasOwn(console, k)) continue
      const orig = console[k].bind(console)
      const value = (...args) => { __test_print(...args); orig(...args) }
      Object.defineProperty(console, k, { value })
    }
    ;0
  `)

  try {
    for (const file of files) {
      await win.webContents.executeJavaScript(`${await file};0`)
      const code = await win.webContents.executeJavaScript('globalThis.EXODUS_TEST_PROMISE')
      if (code !== 0) app.exit(typeof code === 'number' ? code : 1)
    }
  } catch (err) {
    abort(err)
  }

  app.quit()
})
