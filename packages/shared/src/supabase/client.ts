import {
  createClient,
  type SupabaseClient,
  type SupabaseClientOptions,
} from '@supabase/supabase-js';
import type { Database } from '../db/database.types';

export type HawaryDatabase = Database;
export type HawaryClient = SupabaseClient<Database>;

type AuthOptions = NonNullable<SupabaseClientOptions<'public'>['auth']>;

/**
 * Create a Supabase client for Hawary LMS.
 *
 * Pass the project URL and the **anon / publishable** key only — never the
 * service-role key in client apps. Tenant isolation is enforced by RLS.
 *
 * `auth` overrides the browser defaults. The mobile apps pass their own
 * `storage` (there is no localStorage) and turn `detectSessionInUrl` off (there
 * is no URL to read a session from).
 */
export function createHawaryClient(
  url: string,
  anonKey: string,
  auth: AuthOptions = {},
): HawaryClient {
  return createClient<Database>(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      ...auth,
    },
  });
}
