import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const require = createRequire(import.meta.url)
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const FFMPEG = require('ffmpeg-static')
export const FFPROBE = require('ffprobe-static').path

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => existsSync(p))

export function args(argv = process.argv.slice(2)) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) out[a.slice(2)] = true
      else out[a.slice(2)] = argv[++i]
    } else out._.push(a)
  }
  return out
}

export async function launch() {
  return puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: [
      '--hide-scrollbars',
      '--force-color-profile=srgb',
      '--font-render-hinting=none',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--autoplay-policy=no-user-gesture-required',
      '--enable-gpu-rasterization',
      '--ignore-gpu-blocklist',
    ],
  })
}

/** Open the film in render mode and wait until it can be seeked. */
export async function openFilm(browser, { base, only, scale = 1 }) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: scale })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  const url = `${base}/?render=1${only ? `&only=${only}` : ''}`
  await page.goto(url, { waitUntil: 'load', timeout: 120000 })
  await page.waitForFunction('window.__ready === true || !!window.__error', { timeout: 120000 })
  const err = await page.evaluate('window.__error')
  if (err) throw new Error(`film failed to boot:\n${err}`)
  const meta = await page.evaluate('window.__meta')
  return { page, meta, errors }
}

/** Seek and let the compositor produce the frame. */
export async function seekTo(page, t) {
  await page.evaluate(async (t) => {
    await window.__seek(t)
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  }, t)
}
