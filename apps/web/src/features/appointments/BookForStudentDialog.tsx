import { useEffect, useMemo, useState } from 'react'
import { useAcademy } from '@/lib/academy'
import { getLang, useT } from '@/lib/i18n'
import { localeFor } from '@/lib/format'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useStudents } from '@/features/students/api'
import { useMyInstructorRecord } from '@/features/profile/api'
import { SlotPicker } from './SlotPicker'
import { addDays, today } from './calendar'
import {
  useAcademyAvailability,
  useBookAppointment,
  type AssignmentMode,
} from './api'
import { errorMessage } from '@/lib/errors'

/** What the availability RPC will serve in one call; it clamps to 62 either way. */
const WINDOW_DAYS = 62

/**
 * Staff booking somebody in.
 *
 * **Who may be assigned depends on who is asking.** An admin books for the
 * academy, so they get the whole pool and the rota as a default — the office is
 * the one place where round robin is a suggestion rather than a rule, which is
 * what `_instructor_id` from a staff caller means to `book_appointment`. A
 * trainer books for *herself*: no picker, no "assign automatically", and the
 * times on offer are only the ones she is free for. Offering her a slot she
 * cannot take would be a control that fails on submit.
 *
 * The day/time picker is the same `SlotPicker` the student sees. It used to be
 * a bare date input, which could land staff on a day with nothing free and no
 * hint of where to look instead.
 */
export function BookForStudentDialog({
  academyId,
  tz,
  mode,
  open,
  onOpenChange,
}: {
  academyId: string
  tz: string
  mode: AssignmentMode
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useT()
  const locale = localeFor(getLang())
  const { active } = useAcademy()
  const isAdmin = active?.role === 'admin'
  const { data: students } = useStudents(academyId)
  const myInstructor = useMyInstructorRecord(academyId)
  const mineId = myInstructor.data?.id ?? null
  const book = useBookAppointment(academyId)

  const [search, setSearch] = useState('')
  const [studentId, setStudentId] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [instructorId, setInstructorId] = useState('auto')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const from = today(tz)
  const { data: slots, isLoading } = useAcademyAvailability(
    academyId,
    from,
    addDays(from, WINDOW_DAYS),
    open,
  )

  useEffect(() => {
    if (!open) return
    setSearch('')
    setStudentId('')
    setStartsAt('')
    setInstructorId('auto')
    setNote('')
    setError(null)
  }, [open])

  /**
   * A trainer sees only the times she herself is free for; an admin sees
   * everything the academy has. Filtered here rather than in the RPC because
   * the same generator feeds the learner page and the booking check, and it is
   * a view of availability, not a different definition of it.
   */
  const offered = useMemo(() => {
    const all = slots ?? []
    if (isAdmin || !mineId) return all
    return all.filter((s) => (s.instructors ?? []).some((i) => i.id === mineId))
  }, [slots, isAdmin, mineId])

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase()
    const rows = students ?? []
    if (!q) return rows.slice(0, 8)
    return rows
      .filter((s) =>
        [s.full_name, s.email, s.phone, s.student_no].some((v) =>
          v?.toLowerCase().includes(q),
        ),
      )
      .slice(0, 8)
  }, [students, search])

  const chosen = (students ?? []).find((s) => s.id === studentId) ?? null
  const slot = offered.find((s) => s.starts_at === startsAt) ?? null

  // A trainer with no instructor record has nobody to assign to. Said plainly
  // rather than left to fail on submit — the alternative is a dialog that looks
  // ready and is not.
  const blocked = !isAdmin && !mineId && !myInstructor.isLoading

  async function submit() {
    if (!studentId || !startsAt) return
    setError(null)
    try {
      await book.mutateAsync({
        startsAt,
        studentId,
        // A trainer is always the instructor; only an admin may leave it to the
        // rota or hand it to somebody else.
        instructorId: isAdmin
          ? instructorId === 'auto'
            ? null
            : instructorId
          : mineId,
        note: note.trim() || null,
      })
      onOpenChange(false)
    } catch (err) {
      setError(errorMessage(err, t('common.error')))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('appt.book_for.title')}</DialogTitle>
          <DialogDescription>
            {t('appt.book_for.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {blocked ? (
            <p className="text-muted-foreground text-sm">
              {t('appt.book_for.no_record')}
            </p>
          ) : (
            <>
              {/* Student */}
              <div className="grid gap-2">
                <Label htmlFor="book-student">
                  {t('appt.book_for.student')}
                </Label>
                {chosen ? (
                  <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                    <span className="min-w-0 truncate">
                      {chosen.full_name ?? t('common.unnamed')}
                      <span className="text-muted-foreground">
                        {' '}
                        · {chosen.student_no}
                      </span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setStudentId('')}
                    >
                      {t('appt.book_for.change')}
                    </Button>
                  </div>
                ) : (
                  <>
                    <Input
                      id="book-student"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={t('appt.book_for.student_search')}
                    />
                    <ul className="max-h-40 divide-y overflow-y-auto rounded-md border">
                      {matches.length === 0 ? (
                        <li className="text-muted-foreground p-3 text-sm">
                          {t('appt.book_for.no_students')}
                        </li>
                      ) : (
                        matches.map((s) => (
                          <li key={s.id}>
                            <button
                              type="button"
                              className="hover:bg-muted w-full px-3 py-2 text-left text-sm"
                              onClick={() => setStudentId(s.id)}
                            >
                              <span className="block truncate">
                                {s.full_name ?? t('common.unnamed')}
                              </span>
                              <span className="text-muted-foreground block truncate text-xs">
                                {s.student_no}
                                {s.email ? ` · ${s.email}` : ''}
                              </span>
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  </>
                )}
              </div>

              {/* When */}
              <div className="grid gap-2">
                <Label>{t('appt.book_for.time')}</Label>
                {isLoading ? (
                  <p className="text-muted-foreground text-sm">
                    {t('common.loading')}
                  </p>
                ) : (
                  <SlotPicker
                    slots={offered}
                    tz={tz}
                    locale={locale}
                    value={startsAt}
                    onChange={(v) => {
                      setStartsAt(v)
                      setInstructorId('auto')
                    }}
                    emptyLabel={t('appt.book_for.no_slots')}
                  />
                )}
              </div>

              {/* Instructor — an admin's choice to make. A trainer is booking
                  herself in, so there is nothing to pick and no control. */}
              {slot && isAdmin ? (
                <div className="grid gap-2">
                  <Label htmlFor="book-instructor">
                    {t('appt.book_for.instructor')}
                  </Label>
                  <Select value={instructorId} onValueChange={setInstructorId}>
                    <SelectTrigger id="book-instructor">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">
                        {mode === 'round_robin'
                          ? t('appt.book_for.auto_round_robin')
                          : t('appt.book_for.auto_any')}
                      </SelectItem>
                      {(slot.instructors ?? []).map((i) => (
                        <SelectItem key={i.id} value={i.id}>
                          {i.full_name ?? t('common.unnamed')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              <div className="grid gap-2">
                <Label htmlFor="book-note">{t('appt.book_for.note')}</Label>
                <Input
                  id="book-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t('appt.book_for.note_placeholder')}
                />
              </div>

              {error ? (
                <p className="text-destructive text-sm">{error}</p>
              ) : null}
            </>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={book.isPending}
            onClick={() => onOpenChange(false)}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            disabled={blocked || !studentId || !startsAt || book.isPending}
            onClick={submit}
          >
            {book.isPending ? t('appt.booking') : t('appt.book')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
