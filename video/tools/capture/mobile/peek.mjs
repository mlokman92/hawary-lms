// Look inside a screen without shooting it: run a snippet in the page and print
// what it returns. For finding selectors and reading computed styles.
//
//   node tools/capture/mobile/peek.mjs student|academy <url> "<js expression>" [--port N]
//
// The expression runs after the screen has settled; it may be async.

import { launch } from '../shoot.mjs'
import { DEFAULT_PORT, PHONE, VARIANTS } from './paths.mjs'
import { probe } from './server.mjs'

const args = process.argv.slice(2)
const variant = args.find((a) => VARIANTS.includes(a))
const ix = args.indexOf('--port')
const port = ix >= 0 ? Number(args[ix + 1]) : DEFAULT_PORT[variant]
const rest = args.filter((a, i) => a !== variant && i !== ix && i !== ix + 1)
let [url, expr] = rest
if (!variant || !url || !expr) {
  console.error('usage: node peek.mjs student|academy <url> "<js>"|@file.js [--port N]   (in Git Bash: MSYS_NO_PATHCONV=1, or write the url without its leading slash)')
  process.exit(2)
}
if (!url.startsWith('/')) url = '/' + url
if (expr.startsWith('@')) expr = (await import('node:fs')).readFileSync(expr.slice(1), 'utf8')
const state = await probe(port)
if (state.state !== 'harness' || state.info.variant !== variant) {
  console.error(`port ${port} is not the ${variant} harness`)
  process.exit(1)
}

const browser = await launch(['--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1 , EXCLUDE localhost'])
try {
  const page = await browser.newPage()
  page.on('console', (m) => { if (m.type() === 'error') console.log('console.error:', m.text().slice(0, 400)) })
  page.on('pageerror', (e) => console.log('pageerror:', String(e).slice(0, 400)))
  page.on('dialog', (d) => void d.accept().catch(() => {}))
  await page.emulateTimezone('Asia/Kuala_Lumpur')
  await page.setViewport({ width: PHONE.w, height: PHONE.h, deviceScaleFactor: 1 })
  await page.goto(`http://127.0.0.1:${port}${url}`, { waitUntil: 'networkidle0', timeout: 60000 })
  await page.evaluate(() => document.fonts.ready)
  await new Promise((r) => setTimeout(r, 1500))
  const out = await page.evaluate(`(async () => (${expr}))()`)
  console.log(typeof out === 'string' ? out : JSON.stringify(out, null, 2))
} finally {
  await browser.close()
}
