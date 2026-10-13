import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '@/lib/i18n'
import { CopyText } from '@/components/patterns/CopyText'
import { ErrorBlock, LoadingBlock } from '@/components/patterns/QueryState'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useStudent, useStudentEnrollments } from './api'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-0.5">
        {children || <span className="text-muted-foreground">—</span>}
      </dd>
    </div>
  )
}

/**
 * Who a row is about, without leaving the list it was opened from.
 *
 * Read-only on purpose: it is the answer to "whose payment is this, and how do
 * I reach them", asked from a money screen in the middle of something else.
 * Everything that changes a student is on their own page, one button away.
 */
export function StudentSheet({
  studentId,
  onClose,
}: {
  studentId: string | null
  onClose: () => void
}) {
  const { t } = useT()
  const student = useStudent(studentId ?? undefined)
  const enrollments = useStudentEnrollments(studentId ?? undefined)
  const s = student.data
  const courses = (enrollments.data ?? [])
    .map((e) => e.courses?.title)
    .filter(Boolean)
    .join(', ')

  return (
    <Sheet open={!!studentId} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        <SheetHeader className="pr-14">
          <SheetTitle>
            {s ? (s.full_name ?? t('common.unnamed')) : t('common.student')}
          </SheetTitle>
          <SheetDescription>{s?.student_no}</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-6 pb-6">
          {student.error ? (
            <ErrorBlock error={student.error} />
          ) : !s ? (
            <LoadingBlock />
          ) : (
            <>
              <dl className="grid gap-3">
                <Field label={t('common.phone')}>
                  {s.phone ? <CopyText value={s.phone} /> : null}
                </Field>
                <Field label={t('common.email')}>{s.email}</Field>
                <Field label={t('students.field.ic')}>{s.ic_number}</Field>
                <Field label={t('students.field.organization')}>
                  {s.organization}
                </Field>
                <Field label={t('common.course')}>{courses}</Field>
              </dl>
              <Button variant="outline" size="sm" className="self-start" asChild>
                <Link to={`/students/${s.id}`}>{t('common.open')}</Link>
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
