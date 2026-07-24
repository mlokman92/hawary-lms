import { createHawaryClient } from '@hawary/shared'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  throw new Error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY. ' +
      'Copy apps/web/.env.example to apps/web/.env.local and fill in the values.',
  )
}

/** Browser Supabase client (anon/publishable key + RLS). Never the service-role key. */
export const supabase = createHawaryClient(url, key)
