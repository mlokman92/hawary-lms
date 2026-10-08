// How much motion blur will each frame need? node tools/motionscan.mjs --from 0 --to 24 [--only a,b]
// Prints, per second, the sample counts the renderer would pick, and which element moved most.
import { args, launch, openFilm } from './lib.mjs'

const a = args()
const fps = 30
const browser = await launch()
try {
  const { page, meta } = await openFilm(browser, { base: `http://127.0.0.1:${a.port || 5330}`, only: a.only })
  const from = Number(a.from ?? 0)
  const to = Number(a.to ?? meta.duration)
  let total = 0
  const t0 = Date.now()
  for (let s = Math.floor(from); s < to; s++) {
    const row = []
    let worst = { px: 0, who: '' }
    for (let f = 0; f < fps; f++) {
      const t = s + f / fps
      if (t < from || t >= to) continue
      const m = await page.evaluate(async ([t, dt]) => {
        const r = await window.__motion(t, dt)
        return r
      }, [t, 0.5 / fps])
      const M = m.px < 2 ? 1 : Math.min(32, Math.max(2, Math.ceil(m.px / 3)))
      const n = Math.max(M, Math.min(32, m.forced || 0))
      total += n
      row.push(n)
      if (m.px > worst.px) worst = { px: m.px, who: m.who || '' }
    }
    console.log(`${String(s).padStart(3)}s  ${row.map((n) => (n === 1 ? '.' : n.toString(33))).join('')}  max ${worst.px.toFixed(1)}px ${worst.who}`)
  }
  console.log(`\n${total} captures for ${Math.round((to - from) * fps)} frames (${(total / ((to - from) * fps)).toFixed(2)} per frame); scan took ${((Date.now() - t0) / 1000).toFixed(0)}s`)
} finally {
  await browser.close()
}
