import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { findBinary } from './find-binary.js'

// See https://playwright.dev/docs/browsers
// > Playwright doesn't work with the branded version of Firefox since it relies on patches.
// > Playwright doesn't work with the branded version of Safari since it relies on patches.

let puppeteer
let playwright

const puppeteerBrowsers = { brave: 'chrome', msedge: 'chrome' }
const playwrightBrowsers = { chrome: 'chromium', msedge: 'chromium' }

const launched = Object.create(null)
const launchers = {
  async puppeteer({ binary, devtools }) {
    if (!puppeteer) puppeteer = await import('puppeteer-core')
    const browser = Object.hasOwn(puppeteerBrowsers, binary) ? puppeteerBrowsers[binary] : binary
    assert(['chrome', 'firefox'].includes(browser))
    return puppeteer.launch({ executablePath: findBinary(binary), browser, devtools })
  },
  async playwright({ binary: channel, devtools }) {
    if (!playwright) playwright = await import('playwright-core')
    const type = Object.hasOwn(playwrightBrowsers, channel) ? playwrightBrowsers[channel] : channel
    assert(['chromium', 'firefox', 'webkit'].includes(type) && Object.hasOwn(playwright, type))
    return playwright[type].launch({ devtools, channel })
  },
}

export const close = () => Promise.all(Object.values(launched).map((p) => p.then((b) => b.close())))

async function newPage(runner, browser, { binary, dropNetwork }) {
  const context = await (browser.newContext ? browser.newContext() : browser.createBrowserContext())
  if (dropNetwork && context.setOffline && binary !== 'webkit') await context.setOffline(true) // WebKit crashes if this is done prior to navigation to /dev/null
  let page
  try {
    page = await context.newPage()
  } catch (err) {
    // Puppeteer has a bug with Firefox, we expect that and just retry
    if (runner !== 'puppeteer' || binary !== 'firefox' || err.name !== 'ProtocolError') throw err
    await context.close()
    return newPage(runner, browser, { binary, dropNetwork })
  }

  // Need to load a secure origin for e.g. crypto.subtle to be available
  if (runner === 'playwright' && binary === 'webkit') {
    // Can attempt to download /dev/null, so we apply a work-around
    await page.route('https://www.secure-context-top-level-domain-for-tests/*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: '<!doctype html><html><body></body></html>',
      })
    )
    await page.goto('https://www.secure-context-top-level-domain-for-tests/')
  } else {
    await page.goto('file:///dev/null')
  }

  if (dropNetwork && context.setOffline) await context.setOffline(true)
  if (dropNetwork && page.setOfflineMode) await page.setOfflineMode(true)
  assert(!dropNetwork || context.setOffline || page.setOfflineMode)
  return { context, page }
}

export async function run(runner, args, { binary, devtools, dropNetwork, timeout, throttle }) {
  assert(args.length === 1, 'Unexpected args to browser runner')

  const bundle = await readFile(args[0], 'utf8')
  let code = 0
  const [stdout, stderr] = [[], []]

  assert(Object.hasOwn(launchers, runner), 'Unexpected runner')
  if (!launched[runner]) launched[runner] = launchers[runner]({ binary, devtools })
  const { page, context } = await newPage(runner, await launched[runner], { binary, dropNetwork })

  if (throttle) {
    try {
      const cdp = await (page.createCDPSession
        ? page.createCDPSession()
        : context.newCDPSession(page))
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle })
    } catch (cause) {
      throw new Error(`${binary}:${runner} does not support --throttle`, { cause })
    }
  }

  page.on('console', (message) => {
    const type = message.type()
    const target = type === 'error' ? stderr : stdout
    target.push(message.text())
  })
  page.on('pageerror', (error) => {
    if (!code) code = 1
    stderr.push(`${error}`)
  })

  let timer
  const promise = new Promise((resolve) => {
    timer = setTimeout(() => {
      stderr.push('timeout reached')
      resolve(1) // Error code
    }, timeout)
  })

  const wait = async () => {
    await page.evaluate(bundle)
    return page.evaluate('globalThis.EXODUS_TEST_PROMISE')
  }

  try {
    // exitCode might be undefined if we failed before EXODUS_TEST_PROMISE was set, but we will have code then
    const exitCode = await Promise.race([wait(), promise])
    code = code || exitCode
    if (!Number.isInteger(code)) {
      stderr.push('Browser test did not indicate completion. Terminating with a failure...')
      code = 1
    }

    return { code, stdout: stdout.join('\n'), stderr: stderr.join('\n') }
  } catch (error) {
    return { code: 1, stdout: '', stderr: `${error}` }
  } finally {
    clearTimeout(timer)
    await context.close()
  }
}
