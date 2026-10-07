import { supabase } from './supabase'

/**
 * Four RPCs that exist in `supabase/migrations/20261006090200_mobile_removal_rpcs.sql`
 * but were not yet in the database when `packages/shared` last generated its
 * types, so `supabase.rpc()` does not know their names.
 *
 * Once that migration is applied and the types are regenerated, replace each
 * `rpcPending(...)` call with a plain `supabase.rpc(...)` and delete this file.
 */
type Pending = {
  unregister_push_device: { _token: string }
  delete_announcement: { _id: string }
  remove_submission_file: { _file_id: string }
  delete_my_account: Record<string, never>
}

type LooseRpc = (
  fn: string,
  args: Record<string, unknown>,
) => PromiseLike<{ error: { message: string; code?: string } | null }>

export async function rpcPending<K extends keyof Pending>(
  fn: K,
  args: Pending[K],
): Promise<void> {
  const call = supabase.rpc.bind(supabase) as unknown as LooseRpc
  const { error } = await call(fn, args)
  if (error) throw error
}
