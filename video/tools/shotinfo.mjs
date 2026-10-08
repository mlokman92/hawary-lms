// What is in a captured screen?
//
//   node tools/shotinfo.mjs                      every shot, by surface
//   node tools/shotinfo.mjs web/lpkc-queue       its size, named tags, and every captured element
//   node tools/shotinfo.mjs web/lpkc-queue AI    only elements whose text contains "AI"

import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { ROOT } from './lib.mjs'

const [key, needle] = process.argv.slice(2)
const dir = path.join(ROOT, 'public', 'shots')
if (!key) {
  for (const surface of readdirSync(dir)) {
    const ids = readdirSync(path.join(dir, surface)).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', ''))
    console.log(`\n${surface}/  (${ids.length})`)
    for (const id of ids) {
      const m = JSON.parse(readFileSync(path.join(dir, surface, `${id}.json`), 'utf8'))
      console.log(`  ${id.padEnd(28)} ${String(m.w).padStart(4)}x${String(Math.round(m.h)).padEnd(5)} @${m.dpr}  ${Object.keys(m.tags || {}).length} tags  ${(m.url || '').split('?')[0]}`)
    }
  }
  process.exit(0)
}
const m = JSON.parse(readFileSync(path.join(dir, `${key}.json`), 'utf8'))
const r = (v) => String(Math.round(v)).padStart(5)
console.log(`${key}: ${m.w}x${m.h} css px @${m.dpr}x, page height ${m.pageH}${m.clip ? ', clipped macro' : ''}\n   ${m.url}`)
console.log('\nTAGS  (shot.tag(name))            x     y     w     h  radius')
for (const [k, t] of Object.entries(m.tags || {})) console.log(`  ${k.padEnd(26)} ${r(t.x)} ${r(t.y)} ${r(t.w)} ${r(t.h)}  ${t.radius ?? ''}`)
const els = (m.els || []).filter((e) => !needle || (e.text || '').toLowerCase().includes(needle.toLowerCase()))
console.log(`\nELEMENTS (${els.length})  kind tag slot/role                 x     y     w     h  text`)
for (const e of els) console.log(`  ${e.kind.padEnd(4)} ${e.tag.padEnd(8)} ${(e.slot || e.role || '').padEnd(22)} ${r(e.x)} ${r(e.y)} ${r(e.w)} ${r(e.h)}  ${JSON.stringify((e.text || '').slice(0, 70))}`)
