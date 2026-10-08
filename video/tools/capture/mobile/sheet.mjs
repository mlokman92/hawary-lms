// Contact sheets of what was shot, for looking at many frames at once.
//
//   node tools/capture/mobile/sheet.mjs student|academy [--cols 4] [--full]
//
// -> video/.cache/mobile-sheets/<app>-<n>.png   (viewport frames, 390 px wide each, id printed under each)
//    with --full: the "-full" twins instead, one row per sheet.
//
// A sheet is for spotting a frame that needs a second look; the frame itself
// is still what has to be read before it is called clean.

import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { VARIANTS, VIDEO_DIR, outOf } from './paths.mjs'

const args = process.argv.slice(2)
const variant = args.find((a) => VARIANTS.includes(a))
if (!variant) {
  console.error('usage: node sheet.mjs student|academy [--cols N] [--full]')
  process.exit(2)
}
const colsIx = args.indexOf('--cols')
const cols = colsIx >= 0 ? Number(args[colsIx + 1]) : 4
const full = args.includes('--full')

const dir = outOf(variant)
const out = path.join(VIDEO_DIR, '.cache/mobile-sheets')
mkdirSync(out, { recursive: true })

const W = 390
const LABEL = 30
const GAP = 14
const ids = readdirSync(dir)
  .filter((f) => f.endsWith('.png'))
  .map((f) => f.slice(0, -4))
  .filter((id) => id.endsWith('-full') === full)
  .sort((a, b) => readFileSync(path.join(dir, a + '.json')).length * 0 + a.localeCompare(b))

const label = (text, width) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${LABEL}"><rect width="100%" height="100%" fill="#18181b"/><text x="8" y="21" font-family="Consolas, monospace" font-size="16" fill="#fafafa">${text}</text></svg>`,
  )

const perSheet = full ? cols : cols * 2
let n = 0
for (let i = 0; i < ids.length; i += perSheet) {
  const batch = ids.slice(i, i + perSheet)
  const tiles = []
  for (const id of batch) {
    const img = sharp(path.join(dir, id + '.png')).resize({ width: W })
    const buf = await img.png().toBuffer()
    const meta = await sharp(buf).metadata()
    tiles.push({ id, buf, h: meta.height })
  }
  const rows = []
  for (let r = 0; r < tiles.length; r += cols) rows.push(tiles.slice(r, r + cols))
  const rowH = rows.map((row) => Math.max(...row.map((t) => t.h)) + LABEL)
  const width = cols * W + (cols + 1) * GAP
  const height = rowH.reduce((s, h) => s + h + GAP, GAP)
  const composite = []
  let y = GAP
  rows.forEach((row, ri) => {
    row.forEach((t, ci) => {
      const x = GAP + ci * (W + GAP)
      composite.push({ input: label(t.id, W), left: x, top: y })
      composite.push({ input: t.buf, left: x, top: y + LABEL })
    })
    y += rowH[ri] + GAP
  })
  const file = path.join(out, `${variant}${full ? '-full' : ''}-${++n}.png`)
  await sharp({ create: { width, height, channels: 3, background: '#3f3f46' } }).composite(composite).png().toFile(file)
  console.log(`${file}  ${width}x${height}  ${batch.join(', ')}`)
}
