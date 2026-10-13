import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

// One id per build: baked into the bundle as __BUILD_ID__ and published beside
// it as /version.json, so an open tab can tell that a newer build is deployed
// (src/lib/build.ts).
const buildId = Date.now().toString(36)

function buildIdFile(): Plugin {
  return {
    name: 'build-id-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ id: buildId }),
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), buildIdFile()],
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
    // Single React instance in the pnpm monorepo — otherwise react-router-dom's
    // hooks bind to a duplicate React ("Invalid hook call").
    dedupe: ['react', 'react-dom'],
  },
  // Tiptap is only reached through a lazy import (RichTextEditor), so Vite would
  // otherwise discover it mid-session and re-optimize, invalidating in-flight
  // chunks ("504 Outdated Optimize Dep"). Pre-bundle it at server start instead.
  optimizeDeps: {
    include: [
      '@tiptap/react',
      '@tiptap/react/menus',
      '@tiptap/starter-kit',
      '@tiptap/extension-placeholder',
    ],
  },
})
