import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
    // Single React instance in the pnpm monorepo — otherwise react-router-dom's
    // hooks bind to a duplicate React ("Invalid hook call").
    dedupe: ['react', 'react-dom'],
  },
})
