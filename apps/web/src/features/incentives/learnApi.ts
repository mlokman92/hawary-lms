import { useQuery } from '@tanstack/react-query'
import type { Tables } from '@hawary/shared'
import { supabase } from '@/lib/supabase'

/**
 * The columns a student may see of their own payout. The bank snapshot
 * (`bank_account_number`, `bank_code`, `account_holder_name`) is deliberately
 * left out of the projection rather than merely left unrendered: the number is
 * the student's own, so RLS returns it, but nothing on this surface needs it
 * and an account number that never reaches the browser cannot leak from it.
 */
export type MyPayoutRow = Pick<
  Tables<'incentive_payouts'>,
  | 'id'
  | 'batch_id'
  | 'amount_sen'
  | 'status'
  | 'sent_at'
  | 'completed_at'
  | 'created_at'
> & { batch: { title: string } | null }

const SELECT =
  'id, batch_id, amount_sen, status, sent_at, completed_at, created_at, batch:incentive_batches(title)'

/**
 * The signed-in student's incentive payouts, newest first.
 *
 * `incentive_payouts` is SELECT-only for clients and scoped by
 * `app.is_admin(academy_id) OR app.owns_student(student_id)`, so the tenancy
 * boundary is the policy — but a student can hold records in more than one
 * academy, so both ids are filtered here to keep the page showing the academy
 * the switcher is on.
 */
export function useMyPayouts(
  academyId: string | null,
  studentId: string | undefined,
) {
  return useQuery({
    queryKey: ['my-payouts', academyId, studentId] as const,
    enabled: !!academyId && !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('incentive_payouts')
        .select(SELECT)
        .eq('academy_id', academyId!)
        .eq('student_id', studentId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as MyPayoutRow[]
    },
  })
}
