import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../db/database.types';

export type HawaryDatabase = Database;
export type HawaryClient = SupabaseClient<Database>;

/**
 * Create a Supabase client for Hawary LMS.
 *
 * Pass the project URL and the **anon / publishable** key only — never the
 * service-role key in client apps. Tenant isolation is enforced by RLS.
 */
export function createHawaryClient(url: string, anonKey: string): HawaryClient {
  return createClient<Database>(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}
