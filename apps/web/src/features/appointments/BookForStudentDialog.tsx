import { useEffect, useMemo, useState } from 'react'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
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
import { fmtTime, today, type Ymd } from './calendar'
import {
  useAcademyAvailability,
  useBookAppointment,
  type AssignmentMode,
} from './api'

/**
 * Staff booking somebody in.
 *
 * The instructor select offers "auto" even under student_choice, and a named
 * teacher even under round robin: the office is the one place where the rota is
 * a default rather than a rule, which is what `_instructor_id` from a staff
 * caller means to `book_appointment`.
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
  const { data: students } = useStudents(academyId)
  const book = useBookAppointment(academyId)

  const [day, setDay] = useState<Ymd>(() => today(tz))
  const [search, setSearch] = useState('')
  const [studentId, setStudentId] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [instructorId, setInstructorId] = useState('auto')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: slots, isLoading } = useAcademyAvailability(
    academyId,
    day,
    day,
    open,
  )

  useEffect(() => {
    if (!open) return
    setDay(today(tz))
    setSearch('')
    setStudentId('')
    setStartsAt('')
    setInstructorId('auto')
    setNote('')
    setError(null)
  }, [open, tz])

  // Changing the day invalidates the chosen time, and with it the instructor.
  useEffect(() => {
    setStartsAt('')
    setInstructorId('auto')
  }, [day])

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
  const slot = (slots ?? []).find((s) => s.starts_at === startsAt) ?? null

  async function submit() {
    if (!studentId || !startsAt) return
    setError(null)
    try {
      await book.mutateAsync({
        startsAt,
        studentId,
        instructorId: instructorId === 'auto' ? null : instructorId,
        note: note.trim() || null,
      })
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
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
          {/* Student */}
          <div className="grid gap-2">
            <Label htmlFor="book-student">{t('appt.book_for.student')}</Label>
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

          {/* Day */}
          <div className="grid gap-2">
            <Label htmlFor="book-day">{t('appt.book_for.day')}</Label>
            <Input
              id="book-day"
              type="date"
              value={day}
              min={today(tz)}
              onChange={(e) => e.target.value && setDay(e.target.value)}
            />
          </div>

          {/* Time */}
          <div className="grid gap-2">
            <Label>{t('appt.book_for.time')}</Label>
            {isLoading ? (
              <p className="text-muted-foreground text-sm">
                {t('common.loading')}
              </p>
            ) : (slots ?? []).length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {t('appt.book_for.no_slots')}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {(slots ?? []).map((s) => (
                  <button
                    key={s.starts_at}
                    type="button"
                    onClick={() => {
                      setStartsAt(s.starts_at)
                      setInstructorId('auto')
                    }}
                    className={cn(
                      'rounded-md border px-3 py-1.5 text-sm tabular-nums',
                      'focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none',
                      startsAt === s.starts_at
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'hover:border-foreground/30',
                    )}
                  >
                    {fmtTime(s.starts_at, tz)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Instructor */}
          {slot ? (
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

          {error ? <p className="text-destructive text-sm">{error}</p> : null}
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
            disabled={!studentId || !startsAt || book.isPending}
            onClick={submit}
          >
            {book.isPending ? t('appt.booking') : t('appt.book')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
