import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtDateTime } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { useStudentAcademy } from '@/lib/studentAcademy'
import {
  useAttempt,
  useLearnAssessmentMeta,
  useMyAttempts,
  useMyStudent,
  useSaveAnswers,
  useStartAttempt,
  useSubmitAttempt,
  type AttemptPayload,
} from '@/features/learn/api'
import { ATTEMPT_STATUS_META } from '@/features/learn/status'
import { isAnswered, type AnswerValue } from '@/lib/questions'
import { AnswerInput } from '@/components/learn/AnswerInput'
import { BackLink } from '@/components/patterns/BackLink'
import { ListCard } from '@/components/patterns/ListCard'
import { NotFoundBlock, RouteLoading } from '@/components/patterns/QueryState'
import { BlocksView } from '@/components/BlocksView'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { errorMessage } from '@/lib/errors'

/** Milliseconds left until `expiresAt`, ticking once a second. 0 once past. */
function useTimeLeft(expiresAt: string | null | undefined): number | null {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!expiresAt) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [expiresAt])
  if (!expiresAt) return null
  return Math.max(0, new Date(expiresAt).getTime() - now)
}

function Countdown({ left }: { left: number }) {
  const { t, tn } = useT()
  const mins = Math.floor(left / 60000)
  const secs = Math.floor((left % 60000) / 1000)
  // A polite region that changes once a second never yields the queue — it
  // would drown out the question prompts and the student's own typing echo.
  // Announce milestones only; the digits stay available via role="timer",
  // whose implicit aria-live is off.
  const milestone =
    left === 0
      ? t('lwork.timer.time_up')
      : left <= 60_000
        ? tn('lwork.timer.left', 1)
        : left <= 300_000
          ? tn('lwork.timer.left', 5)
          : left <= 600_000
            ? tn('lwork.timer.left', 10)
            : null
  return (
    <>
      <span
        role="timer"
        className={cn(
          'inline-flex items-center gap-1.5 text-sm tabular-nums',
          left < 60000 ? 'text-destructive' : 'text-muted-foreground',
        )}
      >
        <Clock className="size-4" aria-hidden />
        {left === 0
          ? t('lwork.timer.time_up')
          : `${mins}:${String(secs).padStart(2, '0')}`}
      </span>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {milestone}
      </span>
    </>
  )
}

/**
 * The whole screen is driven by the RPCs — never by a table read of the
 * questions. useAssessments() from the staff feature would report "0 questions"
 * here, because its assessment_questions(count) embed returns 0 under the
 * staff-only policy instead of erroring.
 */
export function LearnAssessmentPage() {
  const { id = '' } = useParams<{ id: string }>()
  const { t, tn } = useT()
  const { academyId } = useStudentAcademy()
  const { data: student } = useMyStudent(academyId)
  const {
    data: meta,
    isLoading: metaLoading,
    error: metaError,
  } = useLearnAssessmentMeta(id)
  // isPending, not isLoading: a disabled query reports isLoading:false in
  // TanStack v5, so gating on isLoading would paint "0 attempts used" plus a
  // live Start button for the whole window in which `student` is unknown.
  const { data: history, isPending: historyPending } = useMyAttempts(
    id,
    student?.id ?? null,
  )

  const [attemptId, setAttemptId] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const start = useStartAttempt()
  const { data: live, error: liveError } = useAttempt(attemptId ?? undefined)

  // Resume an attempt that is still open without burning a new one.
  const open = useMemo(
    () => history?.find((a) => a.status === 'in_progress') ?? null,
    [history],
  )
  useEffect(() => {
    if (!attemptId && open) setAttemptId(open.id)
  }, [attemptId, open])

  async function onStart() {
    setErr(null)
    try {
      const payload = await start.mutateAsync(id)
      setAttemptId(payload.attempt.id)
    } catch (e) {
      setErr(errorMessage(e, t('lwork.assessment.error.start')))
    }
  }

  if (attemptId && live) {
    return (
      <AttemptView payload={live} closesAt={meta?.available_until ?? null} />
    )
  }

  if (metaLoading) return <RouteLoading />

  // Resolve "no such assessment" BEFORE the pending gate below: historyPending
  // stays true forever for a permanently-disabled query, so a caller with no
  // student record would otherwise spin indefinitely.
  if (metaError || !meta) {
    return (
      <NotFoundBlock
        message={t('lwork.assessment.not_available')}
        backTo="/learn/courses"
        backLabel={t('lwork.back_to_courses')}
      />
    )
  }

  // An attempt that fails to load is a dead end otherwise: `attemptId` stays
  // set, `live` stays undefined, and the page sits on "Loading…" for good.
  if (attemptId && liveError) {
    return (
      <NotFoundBlock
        message={errorMessage(liveError, t('lwork.attempt.not_available'))}
        backTo={`/learn/courses/${meta.course_id}`}
        backLabel={t('lwork.back_to_course')}
      />
    )
  }

  if (attemptId || historyPending) return <RouteLoading />

  const used = history?.length ?? 0
  const exhausted = used >= meta.max_attempts

  return (
    <div className="mx-auto w-full max-w-3xl">
      <BackLink to={`/learn/courses/${meta.course_id}`}>
        {t('common.course')}
      </BackLink>

      <div className="mt-4">
        <h1 className="text-2xl font-semibold tracking-tight">{meta.title}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {[
            tn('lwork.points', meta.total_points),
            meta.duration_minutes
              ? t('lwork.duration', { count: meta.duration_minutes })
              : null,
            t('lwork.assessment.attempts_used', {
              used,
              total: meta.max_attempts,
            }),
            meta.available_until
              ? t('lwork.closes_at', {
                  date: fmtDateTime(meta.available_until),
                })
              : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>

      <div className="mt-6 space-y-6">
        {history && history.length > 0 ? (
          <ListCard title={t('lwork.assessment.your_attempts')}>
            <ul className="divide-y">
              {history.map((a) => {
                const status = ATTEMPT_STATUS_META[a.status]
                return (
                  <li key={a.id} className="flex items-center gap-2 px-4 py-3">
                    <span className="text-sm">
                      {t('lwork.assessment.attempt_no', { n: a.attempt_no })}
                    </span>
                    <Badge variant={status.variant}>{t(status.labelKey)}</Badge>
                    {a.status === 'graded' ? (
                      <span className="text-sm tabular-nums">
                        {a.score ?? '—'} / {a.max_score ?? '—'}
                      </span>
                    ) : null}
                    <span className="text-muted-foreground ml-auto text-xs">
                      {fmtDateTime(a.submitted_at ?? a.started_at)}
                    </span>
                    <Button size="sm" onClick={() => setAttemptId(a.id)}>
                      {a.status === 'in_progress'
                        ? t('lwork.assessment.resume')
                        : t('common.view')}
                    </Button>
                  </li>
                )
              })}
            </ul>
          </ListCard>
        ) : null}

        {err ? <p className="text-destructive text-sm">{err}</p> : null}

        {!open ? (
          exhausted ? (
            <p className="text-muted-foreground text-sm">
              {t('lwork.assessment.exhausted', { count: meta.max_attempts })}
            </p>
          ) : (
            <Button onClick={() => void onStart()} disabled={start.isPending}>
              {start.isPending
                ? t('lwork.assessment.starting')
                : t('lwork.assessment.start')}
            </Button>
          )
        ) : null}
      </div>
    </div>
  )
}

const AUTOSAVE_MS = 2000

function AttemptView({
  payload,
  closesAt,
}: {
  payload: AttemptPayload
  closesAt: string | null
}) {
  const { attempt, assessment, questions } = payload
  const { t, tn } = useT()
  const save = useSaveAnswers(attempt.id)
  const submit = useSubmitAttempt(attempt.id)
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>(
    attempt.answers,
  )
  const [err, setErr] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const done = attempt.status !== 'in_progress'
  const left = useTimeLeft(done ? null : attempt.expires_at)
  // save_attempt_answers enforces TWO independent deadlines: the per-attempt
  // duration (which is what expires_at encodes) and the assessment's own
  // available_until. An assessment with a window but no duration has a null
  // expires_at, so without closesAt the inputs would stay enabled past the
  // close and autosave a call the server can only reject.
  const untilClose = useTimeLeft(done ? null : closesAt)
  const expired = left === 0 || untilClose === 0
  const readOnly = done || expired
  // Already-scheduled timers capture the old value; the ref lets the callback
  // re-check at fire time.
  const readOnlyRef = useRef(readOnly)
  readOnlyRef.current = readOnly

  // Reseed when the attempt changes identity or is finalised, so the read-only
  // view shows what the server actually stored. Deliberately NOT on every
  // payload: `attempt.answers` is a fresh object on each refetch and each
  // save response, and reseeding from those would wipe anything typed while
  // the request was in flight.
  const syncKey = `${attempt.id}:${attempt.status}`
  const lastSync = useRef(syncKey)
  useEffect(() => {
    if (lastSync.current === syncKey) return
    lastSync.current = syncKey
    setAnswers(attempt.answers)
  }, [syncKey, attempt.answers])

  /** Returns whether the save landed — the submit path depends on knowing. */
  const persist = async (
    next: Record<string, AnswerValue>,
  ): Promise<boolean> => {
    setErr(null)
    try {
      await save.mutateAsync(next)
      return true
    } catch (e) {
      setErr(errorMessage(e, t('lwork.assessment.error.save')))
      return false
    }
  }

  // Debounced autosave alongside the on-blur persist: a timed attempt that only
  // saves on blur loses everything typed in the last focused field.
  const queueSave = (next: Record<string, AnswerValue>) => {
    if (readOnly) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      // Re-check: a timer scheduled a second before the deadline fires after
      // it, and the server would reject that write with a raw error string.
      if (readOnlyRef.current) return
      void persist(next)
    }, AUTOSAVE_MS)
  }

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  const flush = () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <BackLink to={`/learn/courses/${assessment.course_id}`}>
        {t('common.course')}
      </BackLink>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">
            {assessment.title}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {[
              t('lwork.assessment.attempt_of', {
                n: attempt.attempt_no,
                total: assessment.max_attempts,
              }),
              tn('lwork.points', assessment.total_points),
            ].join(' · ')}
          </p>
        </div>
        {/* Show whichever clock exists, so a window-only assessment (no
            duration, hence no expires_at) still gets a countdown. */}
        {!done && (left ?? untilClose) !== null ? (
          <Countdown left={(left ?? untilClose)!} />
        ) : null}
      </div>

      <div className="mt-6 space-y-6">
        {done ? (
          <div className="rounded-xl border p-4 text-sm">
            {attempt.submitted_at
              ? t('lwork.assessment.submitted_on', {
                  date: fmtDateTime(attempt.submitted_at),
                })
              : t('lwork.assessment.submitted')}
            {attempt.status === 'graded' ? (
              <>
                {' '}
                {t('lwork.assessment.score')}{' '}
                <span className="font-medium tabular-nums">
                  {attempt.score ?? '—'} / {attempt.max_score ?? '—'}
                </span>
                .
              </>
            ) : (
              ` ${t('lwork.assessment.awaiting_marking')}`
            )}
          </div>
        ) : expired ? (
          <div className="border-destructive/40 bg-destructive/5 rounded-xl border p-4 text-sm">
            {untilClose === 0
              ? t('lwork.assessment.closed')
              : t('lwork.assessment.time_up')}{' '}
            {t('lwork.assessment.expired_hint')}
          </div>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>{t('lwork.assessment.instructions')}</CardTitle>
          </CardHeader>
          <CardContent>
            <BlocksView body={assessment.instructions} />
          </CardContent>
        </Card>

        <div className="space-y-4">
          {questions.map((q, i) => (
            <Card key={q.id}>
              <CardHeader className="gap-1">
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="text-base">
                    {i + 1}. {q.prompt}
                  </CardTitle>
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    {t('lwork.pts', { count: q.points })}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <AnswerInput
                  question={q}
                  value={answers[q.id]}
                  readOnly={readOnly}
                  onDraft={(v) => {
                    const next = { ...answers, [q.id]: v }
                    setAnswers(next)
                    queueSave(next)
                  }}
                  // A click is a finished answer, so it saves at once rather
                  // than waiting out the typing debounce.
                  onCommit={(v) => {
                    const next = { ...answers, [q.id]: v }
                    setAnswers(next)
                    flush()
                    if (!readOnly) void persist(next)
                  }}
                  onBlur={() => {
                    flush()
                    if (!readOnly) void persist(answers)
                  }}
                />
              </CardContent>
            </Card>
          ))}
        </div>

        {err ? <p className="text-destructive text-sm">{err}</p> : null}

        {!done ? (
          <div className="flex flex-wrap items-center gap-2">
            {/* A choice question left blank looks the same as one answered, so
                say the count out loud before the one-way submit. */}
            <span className="text-muted-foreground mr-auto text-sm">
              {t('lwork.assessment.answered', {
                n: questions.filter((q) =>
                  isAnswered(q.question_type, answers[q.id]),
                ).length,
                total: questions.length,
              })}
            </span>
            <Button
              variant="outline"
              disabled={save.isPending || readOnly}
              onClick={() => {
                flush()
                void persist(answers)
              }}
            >
              {save.isPending
                ? t('common.saving')
                : t('lwork.assessment.save_answers')}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button disabled={submit.isPending}>
                  {t('lwork.assessment.submit')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t('lwork.assessment.confirm_submit.title')}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('lwork.assessment.confirm_submit.body')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={async () => {
                      setErr(null)
                      flush()
                      try {
                        // Never finalise on top of a failed save: submit_attempt
                        // is one-way, and save_attempt_answers refuses every
                        // write afterwards. Past the deadline there is nothing
                        // left to save, so submitting what the server already
                        // holds is correct.
                        if (!readOnly && !(await persist(answers))) return
                        await submit.mutateAsync()
                      } catch (e) {
                        setErr(
                          errorMessage(e, t('lwork.assessment.error.submit')),
                        )
                      }
                    }}
                  >
                    {t('common.submit')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : null}
      </div>
    </div>
  )
}
