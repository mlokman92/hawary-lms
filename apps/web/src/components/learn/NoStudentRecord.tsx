import { BookOpen } from 'lucide-react'
import { useStudentAcademy } from '@/lib/studentAcademy'
import { useT } from '@/lib/i18n'
import { EmptyState } from '@/components/patterns/EmptyState'

/**
 * Accepting an invitation creates the membership but never a student record or
 * an enrolment — both are staff-created — so every learner page has to handle
 * the gap. One home for the copy so the five surfaces cannot drift.
 */
export function NoStudentRecord({ detail }: { detail?: string }) {
  const { active } = useStudentAcademy()
  const { t } = useT()
  return (
    <EmptyState
      size="block"
      icon={BookOpen}
      title={t('shell.no_student_record.title')}
      body={t('shell.no_student_record.body', {
        academy: active?.academy?.name ?? t('academy.this_academy'),
        detail: detail ?? t('shell.no_student_record.detail'),
      })}
    />
  )
}
