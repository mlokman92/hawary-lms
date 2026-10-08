// Build the film's soundtrack: music + voiceover + sound effects -> audio/mix.wav
//
//   node tools/audio/mix.mjs              reads the cue list from the running film (dev server on 5330)
//   node tools/audio/mix.mjs --no-sfx     music and voice only
//   node tools/audio/mix.mjs --no-vo      music and effects only
//
// The voice is levelled clip by clip, the music is pulled down under each line
// with drawn (not compressor-driven) ramps so it never pumps, effects sit lower
// in the quiet passages than in the loud ones, and the result is normalised to
// -14 LUFS / -1.2 dBTP, the level streaming platforms play at.

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { FFMPEG, ROOT, args, launch, openFilm } from '../lib.mjs'

const a = args()
const SR = 48000
const AUDIO = path.join(ROOT, 'audio')
const TMP = path.join(os.tmpdir(), `hawary-mix-${process.pid}`)
mkdirSync(TMP, { recursive: true })
const db = (d) => Math.pow(10, d / 20)
const ff = (argv) => execFileSync(FFMPEG, ['-hide_banner', '-y', ...argv], { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28 })
/** Run ffmpeg and return what it printed on stderr (where filters report their measurements). */
const ffErr = (argv) => String(spawnSync(FFMPEG, ['-hide_banner', '-y', ...argv], { maxBuffer: 1 << 28 }).stderr || '')

function readWav(file) {
  const b = readFileSync(file)
  let p = 12
  let fmt = null
  let data = null
  while (p < b.length - 8) {
    const id = b.toString('ascii', p, p + 4)
    const size = b.readUInt32LE(p + 4)
    if (id === 'fmt ') fmt = { ch: b.readUInt16LE(p + 10), sr: b.readUInt32LE(p + 12), bits: b.readUInt16LE(p + 22) }
    if (id === 'data') { data = b.subarray(p + 8, p + 8 + size); break }
    p += 8 + size + (size % 2)
  }
  if (!fmt || !data || fmt.bits !== 16 || fmt.sr !== SR) throw new Error(`${file}: need 16-bit ${SR} Hz WAV`)
  const n = data.length / (2 * fmt.ch)
  const l = new Float32Array(n), r = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    l[i] = data.readInt16LE(i * 2 * fmt.ch) / 32768
    r[i] = fmt.ch > 1 ? data.readInt16LE(i * 2 * fmt.ch + 2) / 32768 : l[i]
  }
  return { l, r }
}
function writeWavFloat(file, l, r) {
  const n = l.length
  const out = Buffer.alloc(44 + n * 8)
  out.write('RIFF', 0); out.writeUInt32LE(36 + n * 8, 4); out.write('WAVEfmt ', 8)
  out.writeUInt32LE(16, 16); out.writeUInt16LE(3, 20); out.writeUInt16LE(2, 22)
  out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 8, 28); out.writeUInt16LE(8, 32); out.writeUInt16LE(32, 34)
  out.write('data', 36); out.writeUInt32LE(n * 8, 40)
  for (let i = 0; i < n; i++) { out.writeFloatLE(l[i], 44 + i * 8); out.writeFloatLE(r[i], 48 + i * 8) }
  writeFileSync(file, out)
}
const loudness = (file) => {
  const err = ffErr(['-i', file, '-af', 'loudnorm=print_format=json', '-f', 'null', '-'])
  const m = err.match(/\{[\s\S]*?"input_i"[\s\S]*?\}/)
  return m ? JSON.parse(m[0]) : null
}

// ---- cues from the film itself
let meta
if (a.cues) meta = JSON.parse(readFileSync(a.cues, 'utf8'))
else {
  const browser = await launch()
  try {
    meta = (await openFilm(browser, { base: `http://127.0.0.1:${a.port || 5330}` })).meta
  } finally {
    await browser.close()
  }
  writeFileSync(path.join(AUDIO, 'cues.json'), JSON.stringify({ duration: meta.duration, vo: meta.vo, sfx: meta.sfx }, null, 1))
}
const N = Math.ceil(meta.duration * SR)
const L = new Float32Array(N), R = new Float32Array(N)

// ---- music, with the voice's room drawn into it
const music = readWav(path.join(AUDIO, 'music.wav'))
const MUSIC_DB = Number(a.music ?? -3.5)
const DUCK_DB = Number(a.duck ?? -10.5) // under the voice in the full sections
const DUCK_QUIET_DB = -4 //               and in the passages that are already quiet
// how loud the music is around each moment (for ducking and for placing effects in context)
const loud = new Float32Array(N)
{
  const win = Math.round(0.4 * SR)
  let acc = 0
  const sq = (i) => (i >= 0 && i < music.l.length ? music.l[i] * music.l[i] + music.r[i] * music.r[i] : 0)
  for (let i = 0; i < N + win; i++) {
    acc += sq(i) - sq(i - win)
    const c = i - (win >> 1)
    if (c >= 0 && c < N) loud[c] = Math.sqrt(Math.max(0, acc) / (2 * win))
  }
  let peak = 0
  for (let i = 0; i < N; i++) if (loud[i] > peak) peak = loud[i]
  for (let i = 0; i < N; i++) loud[i] /= peak || 1
}
const duck = new Float32Array(N).fill(1)
if (!a['no-vo'] || a['duck-anyway']) {
  const IN = 0.4, OUT = 0.7
  for (const v of meta.vo) {
    const t0 = v.at - 0.15, t1 = v.at + v.end + 0.2
    // one depth per line, from how loud the music is under it
    let m = 0, c = 0
    for (let i = Math.floor(t0 * SR); i < Math.min(N, Math.ceil(t1 * SR)); i += 480) { m += loud[i]; c++ }
    const depth = DUCK_QUIET_DB + (DUCK_DB - DUCK_QUIET_DB) * Math.max(0, Math.min(1, (m / Math.max(1, c) - 0.45) / 0.4))
    for (let i = Math.max(0, Math.floor((t0 - IN) * SR)); i < Math.min(N, Math.ceil((t1 + OUT) * SR)); i++) {
      const t = i / SR
      let k = 1
      if (t < t0) k = (t - (t0 - IN)) / IN
      else if (t > t1) k = 1 - (t - t1) / OUT
      k = 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, k)))
      const g = db(depth * k)
      if (g < duck[i]) duck[i] = g
    }
    console.log(`  duck ${v.file}: ${depth.toFixed(1)} dB`)
  }
}
const fadeFrom = (meta.duration - 0.8) * SR
for (let i = 0; i < N; i++) {
  const fade = i > fadeFrom ? Math.max(0, 1 - (i - fadeFrom) / (0.8 * SR)) : 1
  const g = db(MUSIC_DB) * duck[i] * fade
  L[i] += (music.l[i] || 0) * g
  R[i] += (music.r[i] || 0) * g
}

// ---- voice: clean, level each clip to the same loudness, centre
if (!a['no-vo']) {
  const TARGET = Number(a.voice ?? -17)
  for (const v of meta.vo) {
    const src = path.join(AUDIO, 'vo', `${v.file}.mp3`)
    if (!existsSync(src)) { console.log(`  (no voice clip ${v.file})`); continue }
    const wav = path.join(TMP, `vo_${v.file}.wav`)
    ff(['-i', src, '-af', 'highpass=f=70,acompressor=threshold=-21dB:ratio=2.2:attack=6:release=140:makeup=1.5,equalizer=f=3600:t=q:w=1.2:g=1.5', '-ac', '1', '-ar', String(SR), '-c:a', 'pcm_s16le', wav])
    const m = loudness(wav)
    const gain = m ? db(TARGET - Number(m.input_i)) : 1
    const clip = readWav(wav)
    const o = Math.round(v.at * SR)
    for (let i = 0; i < clip.l.length && i + o < N; i++) { L[i + o] += clip.l[i] * gain; R[i + o] += clip.l[i] * gain }
    console.log(`  voice ${v.file} @ ${v.at.toFixed(2)}s  ${m ? m.input_i : '?'} LUFS -> ${TARGET}  (${(20 * Math.log10(gain)).toFixed(1)} dB)`)
  }
}

// ---- effects
if (!a['no-sfx']) {
  const SFX_DB = Number(a.sfx ?? -7)
  // ticks and pops are the most numerous cues, so they sit lowest
  const BASE = { whoosh: -2, whooshLong: -1, click: -1, tap: -2, pop: -5, tick: -8, ding: 0, success: -1, shimmer: -1, rise: -3, impact: 0 }
  const cache = {}
  let n = 0
  for (const c of meta.sfx) {
    const file = path.join(AUDIO, 'sfx', `${c.name}.wav`)
    if (!existsSync(file)) { console.log(`  (no effect ${c.name})`); continue }
    const s = (cache[c.name] ??= readWav(file))
    const start = c.name === 'rise' ? c.t - s.l.length / SR : c.t
    const o = Math.round(start * SR)
    if (o >= N || o + s.l.length < 0) continue
    // quieter in the quiet passages, so effects never stick out of the music
    const ctx = 0.42 + 0.58 * Math.min(1, loud[Math.max(0, Math.min(N - 1, Math.round(c.t * SR)))] * 1.6)
    const g = db(SFX_DB + (BASE[c.name] ?? 0)) * c.gain * ctx
    const gl = g * Math.cos(((c.pan + 1) * Math.PI) / 4) * Math.SQRT2
    const gr = g * Math.sin(((c.pan + 1) * Math.PI) / 4) * Math.SQRT2
    for (let i = Math.max(0, -o); i < s.l.length && i + o < N; i++) { L[i + o] += s.l[i] * gl; R[i + o] += s.r[i] * gr }
    n++
  }
  console.log(`  ${n} effect cues`)
}

// ---- master
const pre = path.join(TMP, 'pre.wav')
writeWavFloat(pre, L, R)
const out = path.resolve(a.out || path.join(AUDIO, 'mix.wav'))
const I = Number(a.lufs ?? -14)
const lim = 'alimiter=limit=0.89:attack=4:release=60:level=disabled'
const m1 = (() => {
  const err = ffErr(['-i', pre, '-af', `${lim},loudnorm=I=${I}:TP=-1.2:LRA=11:print_format=json`, '-f', 'null', '-'])
  const m = err.match(/\{[\s\S]*?"input_i"[\s\S]*?\}/)
  return m ? JSON.parse(m[0]) : null
})()
const norm = m1
  ? `loudnorm=I=${I}:TP=-1.2:LRA=11:measured_I=${m1.input_i}:measured_TP=${m1.input_tp}:measured_LRA=${m1.input_lra}:measured_thresh=${m1.input_thresh}:offset=${m1.target_offset}:linear=true`
  : `loudnorm=I=${I}:TP=-1.2:LRA=11`
ff(['-i', pre, '-af', `${lim},${norm}`, '-ar', String(SR), '-c:a', 'pcm_s24le', out])
mkdirSync(path.join(ROOT, 'public', 'audio'), { recursive: true })
ff(['-i', out, '-c:a', 'libmp3lame', '-b:a', '192k', path.join(ROOT, 'public', 'audio', 'preview.mp3')])
const fin = loudness(out)
console.log(`  mix: ${m1 ? m1.input_i : '?'} LUFS before -> ${fin ? fin.input_i : '?'} LUFS, true peak ${fin ? fin.input_tp : '?'} dBTP, range ${fin ? fin.input_lra : '?'} LU`)
console.log(`  wrote ${out}`)
