// Render the film to video.
//
//   node tools/render.mjs --out out/film.mp4                       whole film, picture only
//   node tools/render.mjs --from 16 --to 24 --out out/courses.mp4  a section
//   node tools/render.mjs --audio audio/mix.wav --out out/film.mp4 mux a finished soundtrack
//
//   --fps 30         output frame rate
//   --samples auto   motion blur. auto = per frame, as many sub-frames as the motion on screen needs
//                    (1 when nothing moves, up to --max-samples). A number = that many on every frame. 1 = no blur.
//   --max-samples 32
//   --shutter 0.5    fraction of the frame interval the shutter is open (0.5 = 180 degrees)
//   --scale 1        capture scale: 2 = capture at 3840x2160
//   --size 1920x1080 output size (capture is resampled to it; with --scale 2 this is 2x supersampling)
//   --workers 5      parallel browsers (this machine peaks at 4-6)
//   --crf 15 --preset slow
//   --only a,b       mount only these scenes
//   --port 5330      the dev server (pnpm dev) must be running
//
// Each worker owns a slice of the timeline. For every output frame it seeks the
// page to each sub-frame time, screenshots it, and averages the sub-frames in
// linear light (so blur is physically right, not darkened); the result is piped
// raw into that worker's ffmpeg. Segments are joined without re-encoding.

import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { FFMPEG, ROOT, args, launch, openFilm } from './lib.mjs'

const a = args()
const fps = Number(a.fps || 30)
const auto = !a.samples || a.samples === 'auto'
const fixed = auto ? 0 : Number(a.samples)
const maxSamples = Number(a['max-samples'] || 32)
const shutter = Number(a.shutter || 0.5)
const scale = Number(a.scale || 1)
const nWorkers = Number(a.workers || 5)
const crf = String(a.crf || 15)
const preset = String(a.preset || 'slow')
const base = `http://127.0.0.1:${a.port || 5330}`
const out = path.resolve(a.out || path.join(ROOT, 'out', 'film.mp4'))
const tmp = path.resolve(a.tmp || path.join(os.tmpdir(), `hawary-render-${process.pid}`))
const CW = 1920 * scale
const CH = 1080 * scale
const [OW, OH] = String(a.size || `${CW}x${CH}`).split('x').map(Number)

// sRGB <-> linear lookup tables (8-bit in, 16-bit linear, 8-bit out)
const toLin = new Uint16Array(256)
for (let i = 0; i < 256; i++) {
  const c = i / 255
  toLin[i] = Math.round((c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)) * 65535)
}
const toSrgb = new Uint8Array(65536)
for (let i = 0; i < 65536; i++) {
  const c = i / 65535
  toSrgb[i] = Math.round((c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255)
}

function run(cmd, argv) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, argv, { stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    p.stderr.on('data', (d) => (err = (err + d).slice(-4000)))
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${path.basename(cmd)} exited ${code}\n${err}`))))
  })
}

await mkdir(tmp, { recursive: true })
await mkdir(path.dirname(out), { recursive: true })

let meta = { duration: 0 }
if (!a.slice) {
  const probe = await launch()
  meta = (await openFilm(probe, { base, only: a.only, scale: 1 })).meta
  await probe.close()
}

const f0 = Math.round(Number(a.from ?? 0) * fps)
const f1 = Math.round(Number(a.to ?? meta.duration) * fps)
const total = f1 - f0
const per = Math.ceil(total / nWorkers)
const slices = []
for (let i = 0; i < nWorkers; i++) {
  const s = f0 + i * per
  const e = Math.min(f1, s + per)
  if (e > s) slices.push({ i, s, e, file: path.join(tmp, `seg_${String(i).padStart(3, '0')}.mp4`) })
}
if (!a.slice) console.log(`${total} frames @ ${fps}fps, samples ${auto ? `auto (max ${maxSamples})` : fixed}, shutter ${shutter}, capture ${CW}x${CH} -> ${OW}x${OH}, ${slices.length} workers`)

let done = 0
let captures = 0
const t0 = Date.now()
const tty = process.stdout.isTTY
const tick = setInterval(() => {
  const el = (Date.now() - t0) / 1000
  const rate = done / el
  const line = `  ${done}/${total} frames  ${rate.toFixed(1)} fps  ${(captures / Math.max(1, done)).toFixed(1)} samples/frame  eta ${rate > 0 ? Math.round((total - done) / rate) : '?'}s`
  if (tty) process.stdout.write(`\r${line}   `)
  else console.log(line)
}, tty ? 1000 : 15000)

async function work(slice) {
  const browser = await launch()
  try {
    const { page } = await openFilm(browser, { base, only: a.only, scale })
    const cdp = await page.createCDPSession()
    // static luma grain: the paper texture, and the dither that keeps soft gradients from banding in 8-bit
    const vf = [`scale=${OW}:${OH}:out_color_matrix=bt709:out_range=tv:flags=lanczos`, 'format=yuv420p', `noise=c0s=${a.grain ?? 5}:c0f=u`]
    const ff = spawn(
      FFMPEG,
      [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${CW}x${CH}`, '-framerate', String(fps), '-i', '-',
        '-vf', vf.join(','),
        '-c:v', 'libx264', '-preset', preset, '-crf', crf, '-pix_fmt', 'yuv420p', '-threads', '4',
        '-g', String(fps * 2), '-bf', '2',
        '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
        slice.file,
      ],
      { stdio: ['pipe', 'ignore', 'pipe'] },
    )
    let ffErr = ''
    ff.stderr.on('data', (d) => (ffErr = (ffErr + d).slice(-4000)))
    const closed = new Promise((resolve, reject) => ff.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg ${c}: ${ffErr}`)))))
    const grab = async () => {
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 96 })
      captures++
      return sharp(Buffer.from(data, 'base64')).raw().toBuffer()
    }
    const acc = new Uint32Array(CW * CH * 3)
    for (let f = slice.s; f < slice.e; f++) {
      const t = f / fps
      const open = shutter / fps
      let M = fixed
      if (auto) {
        const m = await page.evaluate(([t, dt]) => window.__motion(t, dt), [t, open])
        M = m.px < 2 ? 1 : Math.min(maxSamples, Math.max(2, Math.ceil(m.px / 3)))
        if (m.forced > M) M = Math.min(maxSamples, m.forced)
      }
      let frame
      if (M <= 1) {
        await page.evaluate((t) => window.__seek(t), t)
        frame = await grab()
      } else {
        acc.fill(0)
        for (let s = 0; s < M; s++) {
          await page.evaluate((t) => window.__seek(t), t + (open * s) / M)
          const buf = await grab()
          for (let i = 0; i < acc.length; i++) acc[i] += toLin[buf[i]]
        }
        frame = Buffer.allocUnsafe(acc.length)
        for (let i = 0; i < acc.length; i++) frame[i] = toSrgb[(acc[i] / M) | 0]
      }
      if (!ff.stdin.write(frame)) await new Promise((r) => ff.stdin.once('drain', r))
      done++
    }
    ff.stdin.end()
    await closed
  } finally {
    await browser.close()
  }
}

if (a.slice) {
  // child mode: render one slice and report progress on stdout
  clearInterval(tick)
  const [s, e] = String(a.slice).split(',').map(Number)
  const say = () => process.stdout.write(`P ${done} ${captures}\n`)
  const report = setInterval(say, 1000)
  try {
    await work({ s, e, file: path.resolve(a.segment) })
  } finally {
    clearInterval(report)
  }
  say()
  process.exit(0)
}
const progress = slices.map(() => [0, 0])
try {
  await Promise.all(
    slices.map(
      (sl, i) =>
        new Promise((resolve, reject) => {
          const argv = [fileURLToPath(import.meta.url), ...process.argv.slice(2), '--slice', `${sl.s},${sl.e}`, '--segment', sl.file]
          const child = spawn(process.execPath, argv, { stdio: ['ignore', 'pipe', 'pipe'] })
          let err = ''
          child.stderr.on('data', (d) => (err = (err + d).slice(-4000)))
          child.stdout.on('data', (d) => {
            for (const line of String(d).split(/\r?\n/)) {
              const m = line.match(/^P (\d+) (\d+)/)
              if (m) progress[i] = [Number(m[1]), Number(m[2])]
            }
            done = progress.reduce((n, p) => n + p[0], 0)
            captures = progress.reduce((n, p) => n + p[1], 0)
          })
          child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`render worker ${i} exited ${code}: ${err}`))))
        }),
    ),
  )
} finally {
  clearInterval(tick)
}
console.log(`\n  ${captures} captures for ${total} frames (${(captures / total).toFixed(2)}/frame) in ${((Date.now() - t0) / 1000).toFixed(0)}s`)

const list = path.join(tmp, 'list.txt')
await writeFile(list, slices.map((s) => `file '${s.file.replace(/\\/g, '/')}'`).join('\n'))
const mux = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list]
if (a.audio) {
  mux.push('-ss', String(f0 / fps), '-t', String(total / fps), '-i', path.resolve(a.audio))
  mux.push('-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-shortest')
} else mux.push('-c', 'copy')
mux.push('-movflags', '+faststart', out)
await run(FFMPEG, mux)
if (!a.keep) await rm(tmp, { recursive: true, force: true })
console.log(`  wrote ${out}`)
