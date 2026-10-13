/// <reference types="vite/client" />

/** Set per build in vite.config.ts; the same id is published as /version.json. */
declare const __BUILD_ID__: string

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
