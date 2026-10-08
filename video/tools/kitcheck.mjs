// Screenshot the kit sheet: node tools/kitcheck.mjs [--phone student/home]
import path from 'node:path'
import { ROOT, args, launch } from './lib.mjs'

const a = args()
const browser = await launch()
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 })
  page.on('pageerror', (e) => console.log('pageerror', String(e)))
  page.on('console', (m) => m.type() === 'error' && console.log('console', m.text()))
  await page.goto(`http://127.0.0.1:${a.port || 5330}/kitcheck.html${a.phone ? `?phone=${a.phone}` : ''}`, { waitUntil: 'load' })
  await page.waitForFunction('window.__ready === true', { timeout: 60000 })
  const file = path.join(ROOT, '.stills', 'kitcheck.png')
  await page.screenshot({ path: file })
  console.log(file)
} finally {
  await browser.close()
}
