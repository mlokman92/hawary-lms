import type { NextConfig } from 'next'
import { fileURLToPath } from 'node:url'

const nextConfig: NextConfig = {
  // Marketing page only — no server, no data fetching. Static export keeps
  // deployment as plain files on Netlify, same as every other host this
  // could move to.
  output: 'export',
  images: {
    unoptimized: true,
  },
  // Without this, Turbopack's root inference gets confused by any other
  // lockfile that happens to sit above this repo (e.g. one in $HOME) and
  // may pick the wrong directory as the workspace root.
  turbopack: {
    root: fileURLToPath(new URL('../..', import.meta.url)),
  },
}

export default nextConfig
