import { defineConfig } from 'vite'

// The film is a web page: one 1920x1080 stage whose whole state is a function
// of time. `pnpm dev` previews it; tools/render.mjs seeks it frame by frame.
export default defineConfig({
  root: '.',
  publicDir: 'public',
  server: { host: '127.0.0.1', port: 5330, strictPort: true, hmr: false },
  preview: { host: '127.0.0.1', port: 5331, strictPort: true },
  build: { outDir: 'dist', target: 'esnext', chunkSizeWarningLimit: 4000 },
})
