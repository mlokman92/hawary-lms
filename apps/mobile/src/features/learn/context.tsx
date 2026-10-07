import type { ReactNode } from 'react'
import { useT } from '@/lib/i18n'
import { useMyStudent } from '@/features/learn/api'
import { useScope } from '@/shell/scope'
import { Empty, ErrorBlock, Loading } from '@/ui'

/**
 * The signed-in student's record in the active academy — the thing nearly every
 * learner screen needs before it can ask for anything else.
 */
export function useLearner() {
  const { academyId, active } = useScope()
  const student = useMyStudent(academyId)
  return {
    academyId,
    academyName: active?.academy?.name ?? null,
    student: student.data ?? null,
    isLoading: student.isLoading,
    error: student.error,
  }
}

/**
 * Wraps a learner screen's body in the three states that come before content.
 *
 * "No student record" is a real state, not an error: accepting an invitation
 * creates the membership, and the record can be unlinked or archived later.
 * Without naming it, RLS would simply return nothing and the screen would say
 * the academy had published nothing — a linking problem misreported as an
 * empty course.
 */
export function LearnerGate({
  children,
}: {
  children: (ctx: { academyId: string; studentId: string }) => ReactNode
}) {
  const { t } = useT()
  const { academyId, academyName, student, isLoading, error } = useLearner()
  if (isLoading) return <Loading />
  if (error) return <ErrorBlock error={error} />
  if (!academyId || !student) {
    return (
      <Empty
        icon="user-x"
        title={t('shell.no_student_record.title')}
        body={t('shell.no_student_record.body', {
          academy: academyName ?? t('academy.this_academy'),
          detail: t('shell.no_student_record.detail'),
        })}
      />
    )
  }
  return <>{children({ academyId, studentId: student.id })}</>
}
