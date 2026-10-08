// A labelled contact sheet of captured screens:
//   node tools/shotsheet.mjs <name> <surface/id> <surface/id> ... [--h 420] [--cols 4]
// Writes .stills/shots-<name>.png. Every thumbnail is `--h` pixels tall.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ROOT, args, launch } from './lib.mjs'

const a = args()
const [name, ...keys] = a._
const H = Number(a.h || 420)
const cols = Number(a.cols || 4)
const cells = keys.map((k) => {
  const m = JSON.parse(readFileSync(path.join(ROOT, 'public', 'shots', `${k}.json`), 'utf8'))
  const data = readFileSync(path.join(ROOT, 'public', 'shots', `${k}.png`)).toString('base64')
  const hgt = Math.min(H, (m.h / m.w) * 9999)
  const w = Math.round((m.w / m.h) * hgt)
  return `<div style="display:inline-block;vertical-align:top;margin:6px"><img src="data:image/png;base64,${data}" style="height:${hgt}px;width:${w}px;display:block;object-fit:cover;object-position:top;max-width:${Math.round(H * 1.7)}px"><div style="font:600 14px/26px system-ui;color:#e4e4e7;max-width:${Math.max(w, 120)}px;overflow:hidden;white-space:nowrap">${k}</div></div>`
})
const browser = await launch()
try {
  const page = await browser.newPage()
  await page.setViewport({ width: Number(a.w || 1900), height: 800, deviceScaleFactor: 1 })
  await page.setContent(`<body style="margin:6px;background:#18181b;width:${Number(a.w || 1900) - 12}px">${cells.join('')}</body>`, { waitUntil: 'load' })
  const file = path.join(ROOT, '.stills', `shots-${name}.png`)
  await page.screenshot({ path: file, fullPage: true })
  console.log(file, cols)
} finally {
  await browser.close()
}
