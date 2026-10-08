// Look at the film without rendering it.
//
//   node tools/still.mjs --t 16,18.5,20            frames at those seconds -> <out>/f_0016.000.png ...
//   node tools/still.mjs --from 16 --to 24 --every 0.5 --sheet courses
//                                                   a contact sheet (one PNG, labelled) -> <out>/courses.png
//   node tools/still.mjs --bars 9-13 --per 4 --sheet courses      one frame every 1/4 bar across bars 9..13
//
//   --only open,courses   mount just these scenes (faster; isolates a broken scene)
//   --out <dir>           default: <video>/.stills
//   --scale 1             device scale of single frames (2 = 3840x2160)
//   --cols 4 --thumb 640  contact sheet layout
//   --port 5330           the dev server (pnpm dev) must be running

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { ROOT, args, launch, openFilm, seekTo } from './lib.mjs'

const a = args()
const base = `http://127.0.0.1:${a.port || 5330}`
const outDir = path.resolve(a.out || path.join(ROOT, '.stills'))
const BEAT = 0.5000605431416916
const T0 = 0.06212870006705984
const barT = (n) => T0 + (n - 1) * 4 * BEAT

let times = []
if (a.t) times = String(a.t).split(',').map(Number)
else if (a.bars) {
  const [b0, b1] = String(a.bars).split('-').map(Number)
  const per = Number(a.per || 4)
  for (let b = b0; b < (b1 ?? b0 + 1); b++) for (let k = 0; k < per; k++) times.push(barT(b) + (k * 4 * BEAT) / per)
} else if (a.from !== undefined) {
  const every = Number(a.every || 0.5)
  for (let t = Number(a.from); t <= Number(a.to) + 1e-6; t += every) times.push(Math.round(t * 1000) / 1000)
} else {
  console.error('give --t, --bars or --from/--to')
  process.exit(1)
}

const label = (t) => {
  const b = (t - T0) / BEAT
  return `${t.toFixed(2)}s · bar ${Math.floor(b / 4) + 1}.${(Math.floor(b + 1e-6) % 4) + 1}`
}

await mkdir(outDir, { recursive: true })
const browser = await launch()
try {
  const sheet = a.sheet
  const { page, errors } = await openFilm(browser, { base, only: a.only, scale: sheet ? 1 : Number(a.scale || 1) })
  const shots = []
  for (const t of times) {
    await seekTo(page, t)
    if (sheet) {
      shots.push({ t, data: await page.screenshot({ type: 'jpeg', quality: 88, encoding: 'base64' }) })
    } else {
      const file = path.join(outDir, `f_${t.toFixed(3).padStart(8, '0')}.png`)
      await page.screenshot({ path: file, type: 'png' })
      console.log(file)
    }
  }
  if (sheet) {
    const cols = Number(a.cols || 4)
    const thumb = Number(a.thumb || 640)
    const p2 = await browser.newPage()
    const rows = Math.ceil(shots.length / cols)
    const cellH = Math.round((thumb * 9) / 16) + 30
    await p2.setViewport({ width: cols * (thumb + 8) + 8, height: rows * (cellH + 8) + 8, deviceScaleFactor: 1 })
    const html = `<body style="margin:8px;background:#18181b;display:grid;grid-template-columns:repeat(${cols},${thumb}px);gap:8px;font:600 15px/30px system-ui;color:#e4e4e7">${shots
      .map((s) => `<div><img src="data:image/jpeg;base64,${s.data}" style="width:${thumb}px;display:block"><div style="padding-left:6px">${label(s.t)}</div></div>`)
      .join('')}</body>`
    await p2.setContent(html, { waitUntil: 'load' })
    const file = path.join(outDir, `${sheet === true ? 'sheet' : sheet}.png`)
    await p2.screenshot({ path: file, type: 'png' })
    console.log(file)
  }
  if (errors.length) {
    console.log(`\n${errors.length} console error(s):`)
    for (const e of [...new Set(errors)].slice(0, 12)) console.log('  ' + e.slice(0, 400))
  }
} finally {
  await browser.close()
}
