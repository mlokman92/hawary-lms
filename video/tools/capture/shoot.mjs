// Shared screenshot tool for the showreel. Drives a headless Chrome over
// puppeteer-core and writes, per shot, a PNG plus a JSON of element rects so
// the film can zoom to, lift and highlight real pieces of the real UI.
//
//   import { shootAll } from '../shoot.mjs'
//   await shootAll({ outDir, base: 'http://localhost:5311', shots: [...] })
//
// A shot:
//   { id, url,                         // url is joined onto `base`
//     viewport: { w, h, dpr },         // CSS px + device scale (default 1440x900@2)
//     fullPage: false,                 // true = capture the whole scroll height
//     waitFor: 'css selector' | ms,    // extra settle condition after load
//     steps: [                         // optional interaction before the shot
//       { click: { text: 'Approve' } } | { click: { sel: 'button.x' } },
//       { type: { sel: 'textarea', text: 'hello' } }, { press: 'Escape' },
//       { scroll: { sel: 'main', y: 400 } }, { wait: 300 }, { eval: 'js source' },
//     ],
//     tag: { name: 'css selector' | { text: 'visible text', within?: 'css' } },
//     clip: { sel } | { x, y, w, h },  // macro: capture just this region (use a higher dpr)
//   }
//
// Output JSON: { id, url, w, h, dpr, pageH, clip?, tags: {name: rect},
//               els: [{ kind: 'box'|'text', tag, slot, role, text, x, y, w, h, radius }] }
// Every rect is CSS px relative to the top-left of the captured image.

import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p))

export async function launch(extraArgs = []) {
  return puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: [
      '--hide-scrollbars',
      '--force-color-profile=srgb',
      '--font-render-hinting=none',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      ...extraArgs,
    ],
  })
}

// Runs in the page. Collects the rects the film can address.
function collect(origin) {
  const vw = window.innerWidth
  const docH = document.documentElement.scrollHeight
  const out = []
  const seen = new Set()
  const round = (n) => Math.round(n * 100) / 100
  const transparent = (c) => !c || c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c)
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect()
    if (r.width < 8 || r.height < 8) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue
    const x = r.left + window.scrollX - origin.x
    const y = r.top + window.scrollY - origin.y
    if (x + r.width < 0 || y + r.height < 0 || x > vw || y > docH) continue
    const ownText = [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join(' ')
      .trim()
    const radius = parseFloat(cs.borderTopLeftRadius) || 0
    const bordered = parseFloat(cs.borderTopWidth) > 0 && !transparent(cs.borderTopColor)
    const filled = !transparent(cs.backgroundColor)
    const shadowed = cs.boxShadow && cs.boxShadow !== 'none'
    const tag = el.tagName.toLowerCase()
    const slot = el.getAttribute('data-slot') || undefined
    const role = el.getAttribute('role') || undefined
    const interactive = ['button', 'a', 'input', 'textarea', 'select', 'tr', 'li', 'th', 'td', 'img', 'svg', 'h1', 'h2', 'h3'].includes(tag)
    const isBox =
      (bordered || shadowed || (filled && radius >= 4) || slot || role || interactive) &&
      r.width * r.height < vw * window.innerHeight * 0.96
    let kind = null
    if (isBox) kind = 'box'
    else if (ownText.length > 0) kind = 'text'
    if (!kind) continue
    const text = (kind === 'text' ? ownText : (el.innerText || el.getAttribute('aria-label') || '')).replace(/\s+/g, ' ').trim().slice(0, 120)
    const key = [kind, tag, round(x), round(y), round(r.width), round(r.height)].join('|')
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ kind, tag, slot, role, text, x: round(x), y: round(y), w: round(r.width), h: round(r.height), radius })
  }
  return out
}

function findRect(spec, origin) {
  let el = null
  if (typeof spec === 'string') el = document.querySelector(spec)
  else if (spec.text) {
    const root = spec.within ? document.querySelector(spec.within) : document.body
    if (root) {
      const all = [...root.querySelectorAll('*')].filter((e) => (e.innerText || '').replace(/\s+/g, ' ').trim().includes(spec.text))
      // the deepest element still containing the text, optionally climbing to a wrapper
      el = all.filter((e) => !all.some((o) => o !== e && e.contains(o)))[spec.nth || 0] || null
      if (el && spec.closest) el = el.closest(spec.closest) || el
    }
  }
  if (!el) return null
  const r = el.getBoundingClientRect()
  return {
    x: r.left + window.scrollX - origin.x,
    y: r.top + window.scrollY - origin.y,
    w: r.width,
    h: r.height,
    radius: parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0,
  }
}

async function runStep(page, step) {
  if (step.wait) return new Promise((r) => setTimeout(r, step.wait))
  if (step.press) return page.keyboard.press(step.press)
  if (step.eval) return page.evaluate(step.eval)
  if (step.type) {
    await page.click(step.type.sel)
    return page.type(step.type.sel, step.type.text, { delay: 5 })
  }
  if (step.scroll) {
    return page.evaluate(({ sel, y }) => {
      const el = sel ? document.querySelector(sel) : document.scrollingElement
      el.scrollTop = y
    }, step.scroll)
  }
  if (step.hover || step.click) {
    const target = step.hover || step.click
    const pt = await page.evaluate((t) => {
      let el = null
      if (t.sel) el = document.querySelectorAll(t.sel)[t.nth || 0]
      else {
        const all = [...document.querySelectorAll('*')].filter((e) => (e.innerText || '').replace(/\s+/g, ' ').trim() === t.text || (!t.exact && (e.innerText || '').replace(/\s+/g, ' ').trim().includes(t.text)))
        el = all.filter((e) => !all.some((o) => o !== e && e.contains(o)))[t.nth || 0]
      }
      if (!el) return null
      el.scrollIntoView({ block: 'center' })
      const r = el.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    }, target)
    if (!pt) throw new Error(`step target not found: ${JSON.stringify(target)}`)
    await page.mouse.move(pt.x, pt.y)
    if (step.click) await page.mouse.click(pt.x, pt.y)
    return
  }
  throw new Error(`unknown step ${JSON.stringify(step)}`)
}

export async function shoot(page, shot, { base = '', outDir }) {
  const vp = { w: 1440, h: 900, dpr: 2, ...(shot.viewport || {}) }
  await page.setViewport({ width: vp.w, height: vp.h, deviceScaleFactor: vp.dpr })
  const logs = []
  const onConsole = (m) => { if (m.type() === 'error') logs.push(m.text()) }
  const onPageError = (e) => logs.push(String(e))
  page.on('console', onConsole)
  page.on('pageerror', onPageError)
  await page.goto(base + shot.url, { waitUntil: 'networkidle0', timeout: 60000 })
  await page.evaluate(() => document.fonts.ready)
  if (typeof shot.waitFor === 'string') await page.waitForSelector(shot.waitFor, { timeout: 20000 })
  else if (typeof shot.waitFor === 'number') await new Promise((r) => setTimeout(r, shot.waitFor))
  for (const step of shot.steps || []) await runStep(page, step)
  // let transitions and popovers settle, then freeze whatever is still moving
  await new Promise((r) => setTimeout(r, shot.settle ?? 450))
  await page.addStyleTag({ content: '*,*::before,*::after{animation-play-state:paused!important;transition:none!important;caret-color:transparent!important}' })

  let clip = null
  if (shot.clip) {
    clip = shot.clip.sel
      ? await page.evaluate(findRect, shot.clip.sel, { x: 0, y: 0 })
      : shot.clip
    if (!clip) throw new Error(`clip target not found for ${shot.id}`)
    const pad = shot.clip.pad || 0
    clip = { x: clip.x - pad, y: clip.y - pad, w: clip.w + pad * 2, h: clip.h + pad * 2 }
  }
  const origin = clip ? { x: clip.x, y: clip.y } : { x: 0, y: 0 }
  const pageH = await page.evaluate(() => document.documentElement.scrollHeight)
  const tags = {}
  for (const [name, spec] of Object.entries(shot.tag || {})) {
    const r = await page.evaluate(findRect, spec, origin)
    if (!r) logs.push(`tag not found: ${name}`)
    else tags[name] = r
  }
  const els = await page.evaluate(collect, origin)

  await mkdir(outDir, { recursive: true })
  const file = path.join(outDir, `${shot.id}.png`)
  await page.screenshot({
    path: file,
    type: 'png',
    fullPage: !clip && !!shot.fullPage,
    clip: clip ? { x: clip.x, y: clip.y, width: clip.w, height: clip.h } : undefined,
    captureBeyondViewport: !!clip || !!shot.fullPage,
  })
  const meta = {
    id: shot.id,
    url: shot.url,
    w: clip ? clip.w : vp.w,
    h: clip ? clip.h : shot.fullPage ? pageH : vp.h,
    dpr: vp.dpr,
    pageH,
    clip: clip || undefined,
    tags,
    els: clip
      ? els.filter((e) => e.x >= -1 && e.y >= -1 && e.x + e.w <= clip.w + 1 && e.y + e.h <= clip.h + 1)
      : shot.fullPage ? els : els.filter((e) => e.y < vp.h && e.y + e.h > 0),
  }
  await writeFile(path.join(outDir, `${shot.id}.json`), JSON.stringify(meta))
  page.off('console', onConsole)
  page.off('pageerror', onPageError)
  return { id: shot.id, file, errors: logs }
}

export async function shootAll({ shots, base, outDir, only }) {
  const browser = await launch()
  const results = []
  try {
    for (const shot of shots) {
      if (only && !only.includes(shot.id)) continue
      const page = await browser.newPage()
      try {
        const r = await shoot(page, shot, { base, outDir })
        results.push(r)
        console.log(`ok   ${shot.id}${r.errors.length ? `  (${r.errors.length} console errors: ${r.errors[0].slice(0, 140)})` : ''}`)
      } catch (e) {
        results.push({ id: shot.id, failed: String(e) })
        console.log(`FAIL ${shot.id}  ${e}`)
      } finally {
        await page.close()
      }
    }
  } finally {
    await browser.close()
  }
  return results
}
