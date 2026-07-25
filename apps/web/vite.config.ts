import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    // In the pnpm monorepo, web and mobile resolve slightly different React 19
    // minors, so the hoisted layout can leave more than one physical copy of
    // React. Dedupe forces a single instance here — otherwise react-router-dom's
    // hooks bind to a different React than react-dom renders with ("Invalid hook
    // call" / useRef of null).
    dedupe: ['react', 'react-dom'],
  },
})
