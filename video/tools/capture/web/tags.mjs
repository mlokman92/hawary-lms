// Say what every named tag of a shot actually landed on: its rect, and the text
// of the element with that rect. A tag found is not a tag found on the right
// element — `{ text: 'Paid' }` will happily take a "Partially paid" badge.
//
//   node tools/capture/web/tags.mjs <shots-file.mjs> [id id …] [--all]      (from video/)
//
// Without --all the shell's own tags (sidebar, nav…) and numbered rows are left out.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { VIDEO_DIR } from './server.mjs'

const argv = process.argv.slice(2)
const all = argv.includes('--all')
const [file, ...ids] = argv.filter((a) => a !== '--all')
if (!file) {
  console.error('usage: node tags.mjs <shots-file.mjs> [ids…] [--all]')
  process.exit(2)
}
const mod = await import(pathToFileURL(path.resolve(file)).href)
const outDir = path.resolve(mod.outDir ?? path.join(VIDEO_DIR, 'public/shots/web'))
const boring = /^(sidebar|academy|user|bell|search|nav[A-Z].*|row\d+|q\d+)$/

for (const shot of mod.default ?? []) {
  if (ids.length && !ids.includes(shot.id)) continue
  let j
  try {
    j = JSON.parse(readFileSync(path.join(outDir, `${shot.id}.json`), 'utf8'))
  } catch {
    console.log(`== ${shot.id}  (not shot yet)`)
    continue
  }
  const wanted = Object.keys(shot.tag ?? {})
  const missing = wanted.filter((k) => !(k in j.tags))
  console.log(`== ${shot.id}  ${Math.round(j.w)}x${Math.round(j.h)} @${j.dpr}  ${Object.keys(j.tags).length} tags${missing.length ? `  MISSING: ${missing.join(', ')}` : ''}`)
  for (const [k, r] of Object.entries(j.tags)) {
    if (!all && boring.test(k)) continue
    const near = (a, b) => Math.abs(a - b) < 1.5
    const m = j.els.filter((e) => near(e.x, r.x) && near(e.y, r.y) && near(e.w, r.w) && near(e.h, r.h)).sort((a, b) => b.text.length - a.text.length)[0]
    const off = r.x + r.w < 0 || r.y + r.h < 0 || r.x > j.w || r.y > j.h ? '  OFF-FRAME' : ''
    console.log(`  ${k.padEnd(20)} ${String(Math.round(r.x)).padStart(5)} ${String(Math.round(r.y)).padStart(5)} ${String(Math.round(r.w)).padStart(5)} ${String(Math.round(r.h)).padStart(5)}  ${m ? `${m.tag}: ${m.text.slice(0, 64)}` : '·'}${off}`)
  }
}
