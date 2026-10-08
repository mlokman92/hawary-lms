// Harness-only component variants — the film's one "as it is about to be" feature.
//
// The owner's instruction for the showreel: the LPKC report is uploaded by the
// student, an AI check writes the feedback, and the trainer monitors and gives
// the final approval. The data for that goes through the real shapes (a
// timeline event whose actor is "Hawary AI"); these variants add the two small
// marks the brief allows and nothing else:
//
//   variants/features/reports/ReportTimeline.tsx   an AI entry gets the lucide Sparkles icon in its
//                                                  circle and an outline Badge "AI check"
//   variants/pages/ReportsPage.tsx                 the /lpkc queue rows get one extra cell, "AI check"
//
// A file under variants/ replaces the file at the SAME relative path under
// apps/web/src. Nothing is written into apps/web.
//
// Opt-in per server process (see optInPlugins in ../server.mjs):
//   CAPTURE_PLUGINS=tools/capture/web/variants/plugin.mjs node tools/capture/web/serve.mjs --port 5321
// shots.teaching.mjs sets that variable itself, so `run.mjs shots.teaching.mjs --serve` needs nothing.

import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const slash = (p) => p.replace(/\\/g, '/')

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(full)
  }
  return out
}

export default function variantsPlugin({ webRoot }) {
  const src = path.join(webRoot, 'src')
  /** lower-cased apps/web/src/<rel> (no query) -> the variant file */
  const map = new Map()
  for (const file of walk(here)) {
    const rel = path.relative(here, file)
    map.set(slash(path.join(src, rel)).toLowerCase(), slash(file))
  }
  // Cheap pre-filter: only imports whose last segment names one of the variants are resolved twice.
  const names = [...map.keys()].map((k) => path.basename(k).replace(/\.\w+$/, ''))
  const mentions = (source) => names.some((n) => source.toLowerCase().endsWith(n) || source.toLowerCase().includes(n + '.'))

  return {
    name: 'hawary-capture-variants',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer || source.startsWith('\0') || !mentions(source)) return null
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true })
      if (!resolved) return null
      return map.get(slash(resolved.id.split('?')[0]).toLowerCase()) ?? null
    },
    configureServer(server) {
      server.middlewares.use('/__variants', (_req, res) => {
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ variants: Object.fromEntries(map) }))
      })
    },
  }
}
