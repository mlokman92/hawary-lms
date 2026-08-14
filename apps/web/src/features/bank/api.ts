import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { normalizeAccountNumber, type Tables } from '@hawary/shared'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { translate } from '@/lib/i18n'

export type StudentBankAccount = Tables<'student_bank_accounts'>

/** What the form collects; everything else on the row is derived or stamped. */
export type BankAccountInput = {
  bank_code: string
  bank_account_number: string
  account_holder_name: string
  account_holder_ic: string | null
}

const bankKey = (studentId: string | null | undefined) =>
  ['student-bank-account', studentId ?? ''] as const

/** Mirrors the table's own CHECK, so the two can never disagree. */
const ACCOUNT_NUMBER_RE = /^[0-9]{5,20}$/

/**
 * A student's payout destination. RLS is `app.is_admin(academy_id) OR
 * app.owns_student(student_id)` — a trainer selecting this gets nothing back,
 * not an error, which is why the staff surface gates the card on the role
 * rather than relying on an empty result.
 */
export function useStudentBankAccount(studentId: string | null | undefined) {
  return useQuery({
    queryKey: bankKey(studentId),
    enabled: !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('student_bank_accounts')
        .select('*')
        .eq('student_id', studentId!)
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as StudentBankAccount | null
    },
  })
}

/**
 * Create or replace the row. The PK is `student_id`, so one upsert covers both
 * — there is no separate "has details yet?" branch for the caller to get wrong.
 */
export function useSaveStudentBankAccount(
  academyId: string,
  studentId: string,
) {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (input: BankAccountInput) => {
      const bankCode = input.bank_code.trim().toUpperCase()
      const holder = input.account_holder_name.trim()
      // Normalise before validating: the person typing "1234-5678 9012" has
      // given a valid account, and the DB check only accepts the digits.
      const accountNumber = normalizeAccountNumber(input.bank_account_number)

      // These three mirror the table's CHECK constraints. Caught here because a
      // constraint violation arrives as a raw Postgres 23514 that names the
      // constraint, which is not a sentence anyone can act on.
      if (!bankCode) throw new Error(translate('incentives.bank.error.bank'))
      if (!ACCOUNT_NUMBER_RE.test(accountNumber))
        throw new Error(translate('incentives.bank.error.account_number'))
      if (!holder) throw new Error(translate('incentives.bank.error.holder'))

      const { data, error } = await supabase
        .from('student_bank_accounts')
        .upsert(
          {
            student_id: studentId,
            academy_id: academyId,
            bank_code: bankCode,
            bank_account_number: accountNumber,
            account_holder_name: holder,
            account_holder_ic: input.account_holder_ic?.trim() || null,
            // No trigger stamps this, and knowing whether the admin or the
            // student last changed a payout destination is the point of it.
            updated_by: user?.id ?? null,
          },
          { onConflict: 'student_id' },
        )
        .select()
        .single()
      if (error) throw error
      return data as StudentBankAccount
    },
    onSuccess: (row) => {
      qc.setQueryData(bankKey(studentId), row)
      // The recipient picker reads has_bank/masked_account from
      // `incentive_candidates`, and a 30s staleTime would otherwise still list
      // this student as having no bank details.
      qc.invalidateQueries({ queryKey: ['incentive-candidates'] })
    },
  })
}

export function useRemoveStudentBankAccount(
  academyId: string,
  studentId: string,
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('student_bank_accounts')
        .delete()
        .eq('student_id', studentId)
        // Belt and braces on top of RLS: a stale studentId from another tenant
        // deletes nothing rather than being caught only by the policy.
        .eq('academy_id', academyId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.setQueryData(bankKey(studentId), null)
      qc.invalidateQueries({ queryKey: ['incentive-candidates'] })
    },
  })
}
