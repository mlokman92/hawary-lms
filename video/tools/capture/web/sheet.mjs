// Contact sheets: lay finished shots out six to a page so a whole set can be
// looked over quickly after a reshoot. Reads the PNGs, writes sheets into
// video/.cache/sheets. Nothing here touches the harness.
//
//   node tools/capture/web/sheet.mjs <shots-file.mjs> [id id …]          (from video/)

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { launch } from '../shoot.mjs'
import { VIDEO_DIR } from './server.mjs'

const [file, ...ids] = process.argv.slice(2)
if (!file) {
  console.error('usage: node sheet.mjs <shots-file.mjs> [ids…]')
  process.exit(2)
}
const mod = await import(pathToFileURL(path.resolve(file)).href)
const outDir = path.resolve(mod.outDir ?? path.join(VIDEO_DIR, 'public/shots/web'))
const shots = (mod.default ?? []).filter((s) => ids.length === 0 || ids.includes(s.id))
const sheetDir = path.join(VIDEO_DIR, '.cache', 'sheets')
await mkdir(sheetDir, { recursive: true })

const PER = 6
const browser = await launch(['--allow-file-access-from-files'])
try {
  for (let i = 0; i < shots.length; i += PER) {
    const group = shots.slice(i, i + PER)
    const html = `<!doctype html><meta charset="utf-8"><style>
      body{margin:0;background:#222;font:14px system-ui;color:#fff}
      .g{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:10px}
      figure{margin:0;background:#111}
      figcaption{padding:4px 8px}
      img{display:block;width:100%;height:560px;object-fit:contain;object-position:top;background:#444}
    </style><div class="g">${group
      .map((s) => `<figure><figcaption>${s.id}</figcaption><img src="${pathToFileURL(path.join(outDir, s.id + '.png')).href}"></figure>`)
      .join('')}</div>`
    const htmlFile = path.join(sheetDir, `sheet-${String(i / PER + 1).padStart(2, '0')}.html`)
    await writeFile(htmlFile, html)
    const page = await browser.newPage()
    await page.setViewport({ width: 2700, height: 1210, deviceScaleFactor: 1 })
    await page.goto(pathToFileURL(htmlFile).href, { waitUntil: 'load' })
    await new Promise((r) => setTimeout(r, 400))
    const png = htmlFile.replace(/\.html$/, '.png')
    await page.screenshot({ path: png, type: 'png' })
    await page.close()
    console.log(`${path.relative(process.cwd(), png)}  ${group.map((s) => s.id).join(' · ')}`)
  }
} finally {
  await browser.close()
}
