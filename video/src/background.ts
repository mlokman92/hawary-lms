import { h } from './kit'
import { onEveryFrame, rng } from './engine'
import { music } from './music'

/**
 * The stage every scene plays on: warm paper, two slow lights in the brand's
 * teal and amber, a dot grid, a vignette, grain. It breathes with the track's
 * low end. Scenes can tween `bg` to change the room:
 *   tl.to(bg, { ink: 1, duration: 1.2 }, B(0))   // lights down to deep teal
 */
export const bg = {
  /** 0 = paper, 1 = deep teal-black room. */
  ink: 0,
  /** Strength of the teal and amber lights (1 = normal). */
  teal: 1,
  amber: 1,
  /** Dot grid opacity multiplier. */
  grid: 1,
  /** How much the room reacts to the music (1 = normal). */
  react: 1,
}

export function mountBackground() {
  const root = document.getElementById('bg')!
  const teal = h('div.bg-glow', { style: { width: '1100px', height: '1100px', left: '-260px', top: '-420px', background: 'rgba(45, 212, 191, 0.36)' } })
  const amber = h('div.bg-glow', { style: { width: '900px', height: '900px', left: '1180px', top: '520px', background: 'rgba(252, 211, 77, 0.34)' } })
  const teal2 = h('div.bg-glow', { style: { width: '700px', height: '700px', left: '1300px', top: '-360px', background: 'rgba(15, 118, 110, 0.16)' } })
  const inkLayer = h('div.fill', {
    style: { background: 'radial-gradient(ellipse 90% 90% at 50% 45%, #0e3b38 0%, #082322 55%, #051514 100%)', opacity: '0' },
  })
  const inkGlow = h('div.bg-glow', { style: { width: '1200px', height: '1200px', left: '360px', top: '-60px', background: 'rgba(45, 212, 191, 0.22)', opacity: '0' } })
  const grid = h('div.bg-grid')
  const gridLight = h('div.bg-grid', { style: { backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.22) 1.1px, transparent 1.4px)', opacity: '0' } })
  const vignette = h('div.bg-vignette')
  root.append(teal, amber, teal2, grid, inkLayer, inkGlow, gridLight, vignette)

  // Grain: one seeded noise tile, held still. It is paper texture and it dithers
  // the soft gradients so they do not band in 8-bit video. (Moving grain was
  // tried: it multiplied the bitrate by ten for no visible gain.)
  const tile = 256
  const cv = document.createElement('canvas')
  cv.width = cv.height = tile
  const g = cv.getContext('2d')!
  const im = g.createImageData(tile, tile)
  const r = rng(20261007)
  for (let i = 0; i < tile * tile; i++) {
    const v = Math.floor(r() * 255)
    im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v
    im.data[i * 4 + 3] = 255
  }
  g.putImageData(im, 0, 0)
  const grain = document.getElementById('grain')!
  grain.style.backgroundImage = `url(${cv.toDataURL()})`

  onEveryFrame((t) => {
    const low = music.low(t) * bg.react
    const kick = music.kick(t) * bg.react
    const a = t * 0.16
    teal.style.transform = `translate(${Math.sin(a) * 90}px, ${Math.cos(a * 0.8) * 60}px) scale(${1 + low * 0.07})`
    amber.style.transform = `translate(${Math.cos(a * 0.9 + 1) * 110}px, ${Math.sin(a * 0.7 + 2) * 70}px) scale(${1 + low * 0.09})`
    teal2.style.transform = `translate(${Math.sin(a * 1.1 + 3) * 70}px, ${Math.cos(a + 1) * 50}px)`
    teal.style.opacity = String((0.85 + kick * 0.15) * bg.teal * (1 - bg.ink))
    amber.style.opacity = String((0.8 + kick * 0.2) * bg.amber * (1 - bg.ink))
    teal2.style.opacity = String(bg.teal * (1 - bg.ink))
    grid.style.opacity = String(0.55 * bg.grid * (1 - bg.ink))
    grid.style.transform = `translate(${-(t * 6) % 36}px, ${-(t * 3) % 36}px)`
    inkLayer.style.opacity = String(bg.ink)
    inkGlow.style.opacity = String(bg.ink * (0.7 + low * 0.3))
    inkGlow.style.transform = `translate(${Math.sin(a * 1.3) * 120}px, ${Math.cos(a) * 60}px) scale(${1 + low * 0.08})`
    gridLight.style.opacity = String(0.5 * bg.grid * bg.ink)
    gridLight.style.transform = grid.style.transform
  })
}
