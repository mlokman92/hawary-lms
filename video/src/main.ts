import './styles.css'
import { FPS, H, W, master, motion, mountScene, sceneList, seek, sfxCues } from './engine'
import { mountBackground } from './background'
import { DURATION, FILM, VO, addTransitions } from './film'
import { BEAT, T0 } from './music'

declare global {
  interface Window {
    __seek: (t: number) => Promise<void>
    __motion: (t: number, dt: number) => Promise<{ px: number; forced: number; who: string }>
    __meta: { duration: number; fps: number; width: number; height: number; scenes: ReturnType<typeof sceneList>; sfx: typeof sfxCues; vo: typeof VO }
    __ready: boolean
    __error?: string
  }
}

const q = new URLSearchParams(location.search)
const rendering = q.has('render')
if (rendering) document.body.classList.add('render')
// ?only=courses,students mounts just those scenes (a scene under construction cannot break the others)
const only = q.get('only')?.split(',').filter(Boolean)

async function boot() {
  await Promise.all([...document.fonts].map((f) => f.load().catch(() => {})))
  await document.fonts.ready
  mountBackground()

  let i = 0
  const mounted: string[] = []
  for (const s of FILM) {
    const index = i++
    if (only && !only.includes(s.id)) continue
    const mod = await s.load()
    await mountScene({ id: s.id, start: s.start, end: s.end, lead: s.lead, tail: s.tail, build: mod.default }, index)
    mounted.push(s.id)
  }
  addTransitions(master, mounted)

  window.__seek = seek
  window.__motion = motion
  window.__meta = { duration: DURATION, fps: FPS, width: W, height: H, scenes: sceneList(), sfx: sfxCues, vo: VO }
  await seek(Number(q.get('t') ?? 0))
  window.__ready = true
  if (!rendering) hud()
}

function hud() {
  const stage = document.getElementById('stage')!
  const fit = () => {
    const k = Math.min(innerWidth / W, (innerHeight - 46) / H)
    stage.style.transform = `translateY(-23px) scale(${k})`
  }
  fit()
  addEventListener('resize', fit)

  const bar = document.getElementById('hud')!
  const play = document.createElement('button')
  play.textContent = 'Play'
  const range = document.createElement('input')
  range.type = 'range'
  range.min = '0'
  range.max = String(DURATION)
  range.step = String(1 / FPS)
  range.value = q.get('t') ?? '0'
  const label = document.createElement('span')
  label.style.minWidth = '250px'
  const audio = new Audio('/audio/preview.mp3')
  audio.preload = 'auto'
  bar.append(play, range, label)

  const show = (t: number) => {
    const b = (t - T0) / BEAT
    const scene = sceneList().find((s) => t >= s.start && t < s.end)
    label.textContent = `${t.toFixed(2)}s  ·  bar ${Math.floor(b / 4) + 1}.${(Math.floor(b) % 4) + 1}  ·  ${scene?.id ?? ''}`
  }
  let playing = false
  let t0 = 0
  let w0 = 0
  const tick = () => {
    if (!playing) return
    const t = audio.readyState >= 2 && !audio.paused ? audio.currentTime : t0 + (performance.now() - w0) / 1000
    if (t >= DURATION) {
      playing = false
      play.textContent = 'Play'
      audio.pause()
      return
    }
    range.value = String(t)
    void seek(t)
    show(t)
    requestAnimationFrame(tick)
  }
  play.onclick = () => {
    playing = !playing
    play.textContent = playing ? 'Pause' : 'Play'
    if (playing) {
      t0 = Number(range.value)
      w0 = performance.now()
      audio.currentTime = t0
      audio.play().catch(() => {})
      tick()
    } else audio.pause()
  }
  range.oninput = () => {
    const t = Number(range.value)
    void seek(t)
    show(t)
    if (playing) {
      t0 = t
      w0 = performance.now()
      audio.currentTime = t
    }
  }
  addEventListener('keydown', (e) => {
    if (e.code === 'Space') play.click()
  })
  show(Number(range.value))
}

boot().catch((e) => {
  console.error(e)
  window.__error = String(e?.stack || e)
  document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;inset:0;z-index:99999;margin:0;padding:24px;background:#300;color:#fff;font:14px/1.4 monospace;white-space:pre-wrap">${String(e?.stack || e).replace(/</g, '&lt;')}</pre>`)
})
