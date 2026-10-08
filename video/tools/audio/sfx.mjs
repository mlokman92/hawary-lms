// Synthesises the film's sound effects (no samples, no downloads): node tools/audio/sfx.mjs
// Tuned sounds use C major pentatonic because the soundtrack is in C major.
// Output: audio/sfx/<name>.wav, 48 kHz stereo 16-bit.

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SR = 48000
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../audio/sfx')
mkdirSync(OUT, { recursive: true })

function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let x = Math.imul(a ^ (a >>> 15), 1 | a)
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}
const buf = (secs) => ({ l: new Float32Array(Math.ceil(secs * SR)), r: new Float32Array(Math.ceil(secs * SR)) })
const db = (d) => Math.pow(10, d / 20)
const NOTE = { C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880, C6: 1046.5, D6: 1174.66, E6: 1318.51, G6: 1567.98, A6: 1760, C7: 2093, D7: 2349.32, E7: 2637.02, G7: 3135.96 }

/** Chamberlin state-variable filter over a mono signal with a per-sample cutoff function. */
function svf(x, cutoff, q, mode = 'bp') {
  const y = new Float32Array(x.length)
  let low = 0, band = 0
  for (let i = 0; i < x.length; i++) {
    const f = 2 * Math.sin((Math.PI * Math.min(cutoff(i / x.length), SR / 6.5)) / SR)
    low += f * band
    const high = x[i] - low - q * band
    band += f * high
    y[i] = mode === 'bp' ? band : mode === 'lp' ? low : high
  }
  return y
}
function noise(n, seed) {
  const r = rng(seed)
  const x = new Float32Array(n)
  for (let i = 0; i < n; i++) x[i] = r() * 2 - 1
  return x
}
function addMono(b, x, gain = 1, pan = 0, at = 0) {
  const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4)
  const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4)
  const o = Math.round(at * SR)
  for (let i = 0; i < x.length && i + o < b.l.length; i++) {
    b.l[i + o] += x[i] * gl
    b.r[i + o] += x[i] * gr
  }
}
/** A struck-bar bell: partials with their own decays. */
function bell(freq, secs, { bright = 1, decay = 0.35 } = {}) {
  const n = Math.ceil(secs * SR)
  const x = new Float32Array(n)
  const parts = [
    [1, 1, decay],
    [2.0, 0.42 * bright, decay * 0.55],
    [2.76, 0.2 * bright, decay * 0.32],
    [5.4, 0.1 * bright, decay * 0.16],
  ]
  for (let i = 0; i < n; i++) {
    const t = i / SR
    const attack = Math.min(1, t / 0.003)
    let v = 0
    for (const [m, a, d] of parts) v += a * Math.sin(2 * Math.PI * freq * m * t) * Math.exp(-t / d)
    x[i] = v * attack
  }
  return x
}
/** A small plate: four combs and two allpasses, mixed in. */
function reverb(b, mix = 0.18, size = 1) {
  const run = (x, seedOff) => {
    const combs = [1557, 1617, 1491, 1422].map((d) => Math.round((d + seedOff) * size * (SR / 44100)))
    const out = new Float32Array(x.length)
    for (const d of combs) {
      const line = new Float32Array(d)
      let p = 0, lp = 0
      for (let i = 0; i < x.length; i++) {
        const o = line[p]
        lp = o * 0.72 + lp * 0.28
        line[p] = x[i] + lp * 0.78
        p = (p + 1) % d
        out[i] += o * 0.25
      }
    }
    for (const d of [225, 556].map((v) => Math.round(v * (SR / 44100)))) {
      const line = new Float32Array(d)
      let p = 0
      for (let i = 0; i < out.length; i++) {
        const o = line[p]
        const v = out[i] + o * 0.5
        line[p] = v
        p = (p + 1) % d
        out[i] = o - v * 0.5
      }
    }
    return out
  }
  const wl = run(b.l, 0), wr = run(b.r, 23)
  for (let i = 0; i < b.l.length; i++) {
    b.l[i] += wl[i] * mix
    b.r[i] += wr[i] * mix
  }
}
function finish(name, b, peakDb) {
  // short fades so nothing clicks, then set the peak
  const f = Math.min(Math.round(0.004 * SR), b.l.length >> 1)
  for (let i = 0; i < f; i++) {
    const k = i / f
    b.l[i] *= k; b.r[i] *= k
    b.l[b.l.length - 1 - i] *= k; b.r[b.r.length - 1 - i] *= k
  }
  let peak = 0
  for (let i = 0; i < b.l.length; i++) peak = Math.max(peak, Math.abs(b.l[i]), Math.abs(b.r[i]))
  const g = db(peakDb) / (peak || 1)
  const n = b.l.length
  const out = Buffer.alloc(44 + n * 4)
  out.write('RIFF', 0); out.writeUInt32LE(36 + n * 4, 4); out.write('WAVEfmt ', 8)
  out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22)
  out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 4, 28); out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34)
  out.write('data', 36); out.writeUInt32LE(n * 4, 40)
  for (let i = 0; i < n; i++) {
    out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, b.l[i] * g)) * 32767), 44 + i * 4)
    out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, b.r[i] * g)) * 32767), 46 + i * 4)
  }
  writeFileSync(path.join(OUT, `${name}.wav`), out)
  console.log(`${name.padEnd(12)} ${(n / SR).toFixed(2)}s  peak ${peakDb} dB`)
}
const env = (n, fn) => { const e = new Float32Array(n); for (let i = 0; i < n; i++) e[i] = fn(i / n, i / SR); return e }
const mul = (x, e) => { const y = new Float32Array(x.length); for (let i = 0; i < x.length; i++) y[i] = x[i] * e[i]; return y }

// ---- whoosh: air moving past. Band-passed noise whose band and level swell and fall.
{
  const secs = 0.46, n = Math.ceil(secs * SR), b = buf(secs)
  const swell = env(n, (p) => Math.pow(Math.sin(Math.PI * Math.pow(p, 0.8)), 2.2))
  const a = mul(svf(noise(n, 11), (p) => 500 + 4600 * Math.pow(Math.sin(Math.PI * Math.pow(p, 0.85)), 1.5), 0.9), swell)
  const c = mul(svf(noise(n, 12), (p) => 220 + 900 * Math.sin(Math.PI * p), 1.4, 'lp'), swell)
  for (let i = 0; i < n; i++) {
    const pan = -0.55 + 1.1 * (i / n)
    const gl = Math.cos(((pan + 1) * Math.PI) / 4), gr = Math.sin(((pan + 1) * Math.PI) / 4)
    b.l[i] = (a[i] + c[i] * 0.35) * gl
    b.r[i] = (a[i] + c[i] * 0.35) * gr
  }
  finish('whoosh', b, -9)
}
// ---- whooshLong: a bigger pass for scene changes.
{
  const secs = 0.95, n = Math.ceil(secs * SR), b = buf(secs)
  const swell = env(n, (p) => Math.pow(Math.sin(Math.PI * Math.pow(p, 1.25)), 2))
  const a = mul(svf(noise(n, 21), (p) => 300 + 3600 * Math.pow(Math.sin(Math.PI * Math.pow(p, 1.2)), 1.3), 0.8), swell)
  const c = mul(svf(noise(n, 22), (p) => 140 + 700 * Math.sin(Math.PI * Math.pow(p, 1.2)), 1.2, 'lp'), swell)
  for (let i = 0; i < n; i++) {
    const pan = -0.7 + 1.4 * (i / n)
    const gl = Math.cos(((pan + 1) * Math.PI) / 4), gr = Math.sin(((pan + 1) * Math.PI) / 4)
    b.l[i] = (a[i] + c[i] * 0.5) * gl
    b.r[i] = (a[i] + c[i] * 0.5) * gr
  }
  reverb(b, 0.1)
  finish('whooshLong', b, -8)
}
// ---- click: a mouse button. A tiny tick over a short woody knock.
{
  const secs = 0.07, n = Math.ceil(secs * SR), b = buf(secs)
  const x = new Float32Array(n), nz = noise(n, 31)
  for (let i = 0; i < n; i++) {
    const t = i / SR
    x[i] = Math.sin(2 * Math.PI * 2100 * t) * Math.exp(-t / 0.004) * 0.6 + Math.sin(2 * Math.PI * 380 * t) * Math.exp(-t / 0.012) * 0.8 + nz[i] * Math.exp(-t / 0.0012) * 0.5
  }
  addMono(b, x)
  finish('click', b, -10)
}
// ---- tap: a fingertip on glass. Softer, lower, rounder.
{
  const secs = 0.1, n = Math.ceil(secs * SR), b = buf(secs)
  const x = new Float32Array(n), nz = noise(n, 41)
  let ph = 0
  for (let i = 0; i < n; i++) {
    const t = i / SR
    ph += (2 * Math.PI * (260 + 520 * Math.exp(-t / 0.012))) / SR
    x[i] = Math.sin(ph) * Math.exp(-t / 0.022) + nz[i] * Math.exp(-t / 0.002) * 0.18
  }
  addMono(b, x)
  finish('tap', b, -11)
}
// ---- pop: a label arriving. A quick upward blip landing on G.
{
  const secs = 0.2, n = Math.ceil(secs * SR), b = buf(secs)
  const x = new Float32Array(n)
  let ph = 0
  for (let i = 0; i < n; i++) {
    const t = i / SR
    const f = NOTE.G5 * (0.5 + 0.5 * Math.min(1, t / 0.045))
    ph += (2 * Math.PI * f) / SR
    x[i] = (Math.sin(ph) + 0.25 * Math.sin(2 * ph)) * Math.min(1, t / 0.002) * Math.exp(-t / 0.05)
  }
  addMono(b, x)
  reverb(b, 0.08, 0.6)
  finish('pop', b, -12)
}
// ---- tick: the smallest step.
{
  const secs = 0.04, n = Math.ceil(secs * SR), b = buf(secs)
  const x = new Float32Array(n), nz = noise(n, 51)
  for (let i = 0; i < n; i++) {
    const t = i / SR
    x[i] = Math.sin(2 * Math.PI * 3300 * t) * Math.exp(-t / 0.0035) + nz[i] * Math.exp(-t / 0.0008) * 0.3
  }
  addMono(b, x)
  finish('tick', b, -16)
}
// ---- ding: a notification. Two soft bells, a fifth resolving up to the tonic (G5 -> C6).
{
  const secs = 1.3, b = buf(secs)
  addMono(b, bell(NOTE.G5, 1.1, { decay: 0.3, bright: 0.8 }), 0.9, -0.15, 0)
  addMono(b, bell(NOTE.C6, 1.1, { decay: 0.42, bright: 0.7 }), 1, 0.15, 0.115)
  reverb(b, 0.2)
  finish('ding', b, -9)
}
// ---- success: done, approved, paid. A quick rising C major triad.
{
  const secs = 1.2, b = buf(secs)
  addMono(b, bell(NOTE.C6, 1.0, { decay: 0.22, bright: 0.7 }), 0.8, -0.2, 0)
  addMono(b, bell(NOTE.E6, 1.0, { decay: 0.26, bright: 0.7 }), 0.85, 0, 0.07)
  addMono(b, bell(NOTE.G6, 1.0, { decay: 0.4, bright: 0.6 }), 1, 0.2, 0.14)
  reverb(b, 0.22)
  finish('success', b, -9)
}
// ---- shimmer: the AI at work. A spray of small pentatonic bells and a breath of air.
{
  const secs = 2.0, b = buf(secs), r = rng(61)
  const pool = [NOTE.C6, NOTE.D6, NOTE.E6, NOTE.G6, NOTE.A6, NOTE.C7, NOTE.D7, NOTE.E7, NOTE.G7]
  for (let k = 0; k < 20; k++) {
    const at = Math.pow(k / 20, 0.8) * 1.15
    addMono(b, bell(pool[Math.floor(r() * pool.length)], 0.7, { decay: 0.12 + r() * 0.16, bright: 0.5 }), 0.35 + r() * 0.5, r() * 1.6 - 0.8, at)
  }
  const n = Math.ceil(1.4 * SR)
  const air = mul(svf(noise(n, 62), (p) => 5000 + 4000 * p, 0.7, 'bp'), env(n, (p) => Math.sin(Math.PI * p) * 0.25))
  addMono(b, air, 1, 0, 0)
  reverb(b, 0.3, 1.2)
  finish('shimmer', b, -10)
}
// ---- rise: two seconds of gathering air that stops dead. The cue time is its END.
{
  const secs = 2.0, n = Math.ceil(secs * SR), b = buf(secs)
  const grow = env(n, (p) => Math.pow(p, 2.4))
  const a = mul(svf(noise(n, 71), (p) => 350 + 7000 * Math.pow(p, 2), 0.6), grow)
  const c = mul(svf(noise(n, 72), (p) => 1200 + 9000 * Math.pow(p, 1.5), 1.1, 'hp'), env(n, (p) => Math.pow(p, 3.5) * 0.4))
  for (let i = 0; i < n; i++) {
    const w = 0.5 + 0.5 * Math.sin(2 * Math.PI * (2 + 10 * (i / n)) * (i / SR)) // a flutter that speeds up
    b.l[i] = (a[i] + c[i]) * (0.8 + 0.2 * w)
    b.r[i] = (a[i] + c[i]) * (0.8 + 0.2 * (1 - w))
  }
  finish('rise', b, -9)
}
// ---- impact: a big landing. A falling sub, a soft crack, a short room.
{
  const secs = 1.6, n = Math.ceil(secs * SR), b = buf(secs)
  const x = new Float32Array(n), nz = svf(noise(n, 81), () => 1400, 1.0, 'lp')
  let ph = 0
  for (let i = 0; i < n; i++) {
    const t = i / SR
    ph += (2 * Math.PI * (44 + 70 * Math.exp(-t / 0.05))) / SR
    x[i] = Math.sin(ph) * Math.exp(-t / 0.34) + nz[i] * Math.exp(-t / 0.035) * 0.55
  }
  addMono(b, x)
  reverb(b, 0.16, 1.4)
  finish('impact', b, -5)
}
