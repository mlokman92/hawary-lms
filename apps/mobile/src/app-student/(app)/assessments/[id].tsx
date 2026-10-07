import { useEffect, useMemo, useRef, useState } from 'react'
import { View } from 'react-native'
import { Stack, useLocalSearchParams } from 'expo-router'
import { errorMessage } from '@/lib/errors'
import { fmtDateTime } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { isAnswered, type AnswerValue } from '@/lib/questions'
import { AnswerInput } from '@/features/learn/AnswerInput'
import {
  useAttempt,
  useLearnAssessmentMeta,
  useMyAttempts,
  useSaveAnswers,
  useStartAttempt,
  useSubmitAttempt,
  type AttemptPayload,
} from '@/features/learn/api'
import { LearnerGate } from '@/features/learn/context'
import { ATTEMPT_STATUS_META } from '@/features/learn/status'
import {
  Badge,
  Button,
  Card,
  confirm,
  ErrorBlock,
  FormError,
  Loading,
  Row,
  Screen,
  T,
  space,
} from '@/ui'
import { BlocksView } from '@/ui/Blocks'

/** How long after the last keystroke a typed answer is saved. */
const AUTOSAVE_MS = 1500

/** Milliseconds left until `expiresAt`, ticking once a second. 0 once past. */
function useTimeLeft(expiresAt: string | null | undefined): number | null {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!expiresAt) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [expiresAt])
  if (!expiresAt) return null
  return Math.max(0, new Date(expiresAt).getTime() - now)
}

function clock(ms: number): string {
  const total = Math.ceil(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

export default function AssessmentScreen() {
  const { t } = useT()
  return (
    <>
      <Stack.Screen options={{ title: t('learn.kind.assessment') }} />
      <LearnerGate>
        {({ studentId }) => <Assessment studentId={studentId} />}
      </LearnerGate>
    </>
  )
}

/**
 * An assessment: the landing (attempts used, start or resume) and the attempt
 * itself. Everything goes through the four attempt RPCs, which never send
 * `correct_answer` to a client (docs/question-types.md).
 */
function Assessment({ studentId }: { studentId: string }) {
  const { id = '' } = useLocalSearchParams<{ id: string }>()
  const { t, tn } = useT()
  const { data: meta, isLoading: metaLoading, error: metaError } =
    useLearnAssessmentMeta(id)
  const { data: history, isPending: historyPending } = useMyAttempts(id, studentId)

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
      <AttemptView
        payload={live}
        closesAt={meta?.available_until ?? null}
        onBack={() => setAttemptId(null)}
      />
    )
  }
  if (metaLoading) return <Loading />
  if (metaError || !meta) {
    return (
      <ErrorBlock error={metaError ?? new Error(t('lwork.assessment.not_available'))} />
    )
  }
  if (attemptId && liveError) {
    return (
      <ErrorBlock
        error={new Error(errorMessage(liveError, t('lwork.attempt.not_available')))}
        onRetry={() => setAttemptId(null)}
      />
    )
  }
  if (attemptId || historyPending) return <Loading />

  const used = history?.length ?? 0
  const exhausted = used >= meta.max_attempts

  return (
    <Screen
      footer={
        open || exhausted ? null : (
          <Button
            title={
              start.isPending
                ? t('lwork.assessment.starting')
                : t('lwork.assessment.start')
            }
            loading={start.isPending}
            onPress={() => void onStart()}
          />
        )
      }
    >
      <View style={{ gap: 6 }}>
        <T v="title">{meta.title}</T>
        <T v="small" muted>
          {[
            tn('lwork.points', Number(meta.total_points)),
            meta.duration_minutes
              ? t('lwork.duration', { count: meta.duration_minutes })
              : null,
            t('lwork.assessment.attempts_used', { used, total: meta.max_attempts }),
            meta.available_until
              ? t('lwork.closes_at', { date: fmtDateTime(meta.available_until) })
              : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </T>
      </View>

      {history && history.length > 0 ? (
        <View style={{ gap: space.sm }}>
          <T v="heading">{t('lwork.assessment.your_attempts')}</T>
          <Card flush>
            {history.map((a, i) => {
              const status = ATTEMPT_STATUS_META[a.status]
              return (
                <Row
                  key={a.id}
                  first={i === 0}
                  title={t('lwork.assessment.attempt_no', { n: a.attempt_no })}
                  subtitle={[
                    a.status === 'graded'
                      ? `${a.score ?? '—'} / ${a.max_score ?? '—'}`
                      : null,
                    fmtDateTime(a.submitted_at ?? a.started_at),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  right={<Badge label={t(status.labelKey)} variant={status.variant} />}
                  onPress={() => setAttemptId(a.id)}
                />
              )
            })}
          </Card>
        </View>
      ) : null}

      <FormError error={err} />
      {!open && exhausted ? (
        <T muted>{t('lwork.assessment.exhausted', { count: meta.max_attempts })}</T>
      ) : null}
    </Screen>
  )
}

function AttemptView({
  payload,
  closesAt,
  onBack,
}: {
  payload: AttemptPayload
  closesAt: string | null
  onBack: () => void
}) {
  const { attempt, assessment, questions } = payload
  const { t, tn } = useT()
  const save = useSaveAnswers(attempt.id)
  const submit = useSubmitAttempt(attempt.id)
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>(attempt.answers)
  const [err, setErr] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const done = attempt.status !== 'in_progress'
  const left = useTimeLeft(done ? null : attempt.expires_at)
  // Two independent deadlines: the attempt's own duration (`expires_at`) and
  // the assessment's window. An assessment with a window but no duration has a
  // null `expires_at`, so without this the inputs would stay live past the
  // close and autosave a call the server can only reject.
  const untilClose = useTimeLeft(done ? null : closesAt)
  const expired = left === 0 || untilClose === 0
  const readOnly = done || expired
  // A timer scheduled a second before the deadline fires after it; the ref
  // lets the callback re-check at fire time.
  const readOnlyRef = useRef(readOnly)
  readOnlyRef.current = readOnly

  // Reseed when the attempt changes identity or is finalised — NOT on every
  // payload, which is a fresh object on each save response and would wipe
  // whatever was typed while that request was in flight.
  const syncKey = `${attempt.id}:${attempt.status}`
  const lastSync = useRef(syncKey)
  useEffect(() => {
    if (lastSync.current === syncKey) return
    lastSync.current = syncKey
    setAnswers(attempt.answers)
  }, [syncKey, attempt.answers])

  /** Returns whether the save landed — the submit path depends on knowing. */
  const persist = async (next: Record<string, AnswerValue>): Promise<boolean> => {
    setErr(null)
    try {
      await save.mutateAsync(next)
      return true
    } catch (e) {
      setErr(errorMessage(e, t('lwork.assessment.error.save')))
      return false
    }
  }

  const flush = () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }

  const queueSave = (next: Record<string, AnswerValue>) => {
    if (readOnly) return
    flush()
    timer.current = setTimeout(() => {
      if (readOnlyRef.current) return
      void persist(next)
    }, AUTOSAVE_MS)
  }

  useEffect(() => flush, [])

  async function onSubmit() {
    const ok = await confirm({
      title: t('lwork.assessment.confirm_submit.title'),
      message: t('lwork.assessment.confirm_submit.body'),
      confirmLabel: t('common.submit'),
      cancelLabel: t('common.cancel'),
    })
    if (!ok) return
    setErr(null)
    flush()
    try {
      // Never finalise on top of a failed save: submit_attempt is one-way.
      // Past the deadline there is nothing left to save, so submitting what
      // the server already holds is correct.
      if (!readOnly && !(await persist(answers))) return
      await submit.mutateAsync()
    } catch (e) {
      setErr(errorMessage(e, t('lwork.assessment.error.submit')))
    }
  }

  const answered = questions.filter((q) =>
    isAnswered(q.question_type, answers[q.id]),
  ).length
  const remaining = left ?? untilClose

  return (
    <Screen
      footer={
        done ? (
          <Button variant="outline" title={t('common.back')} onPress={onBack} />
        ) : (
          <>
            <T v="small" muted center>
              {t('lwork.assessment.answered', { n: answered, total: questions.length })}
            </T>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Button
                style={{ flex: 1 }}
                variant="outline"
                title={
                  save.isPending
                    ? t('common.saving')
                    : t('lwork.assessment.save_answers')
                }
                disabled={save.isPending || readOnly}
                onPress={() => {
                  flush()
                  void persist(answers)
                }}
              />
              <Button
                style={{ flex: 1 }}
                title={t('lwork.assessment.submit')}
                loading={submit.isPending}
                onPress={() => void onSubmit()}
              />
            </View>
          </>
        )
      }
    >
      <Stack.Screen
        options={{
          title: t('learn.kind.assessment'),
          // The clock lives in the header so it stays in view while scrolling
          // through the questions.
          headerRight: () =>
            !done && remaining !== null ? (
              <T
                bold
                tone={remaining <= 5 * 60_000 ? 'danger' : undefined}
                style={{ fontVariant: ['tabular-nums'] }}
              >
                {remaining === 0 ? t('lwork.timer.time_up') : clock(remaining)}
              </T>
            ) : null,
        }}
      />
      <View style={{ gap: 6 }}>
        <T v="title">{assessment.title}</T>
        <T v="small" muted>
          {[
            t('lwork.assessment.attempt_of', {
              n: attempt.attempt_no,
              total: assessment.max_attempts,
            }),
            tn('lwork.points', Number(assessment.total_points)),
          ].join(' · ')}
        </T>
      </View>

      {done ? (
        <Card>
          <T>
            {attempt.submitted_at
              ? t('lwork.assessment.submitted_on', {
                  date: fmtDateTime(attempt.submitted_at),
                })
              : t('lwork.assessment.submitted')}{' '}
            {attempt.status === 'graded'
              ? `${t('lwork.assessment.score')} ${attempt.score ?? '—'} / ${attempt.max_score ?? '—'}`
              : t('lwork.assessment.awaiting_marking')}
          </T>
        </Card>
      ) : expired ? (
        <Card>
          <T tone="danger">
            {untilClose === 0
              ? t('lwork.assessment.closed')
              : t('lwork.assessment.time_up')}{' '}
            {t('lwork.assessment.expired_hint')}
          </T>
        </Card>
      ) : null}

      <Card style={{ gap: space.md }}>
        <T v="heading">{t('lwork.assessment.instructions')}</T>
        <BlocksView body={assessment.instructions} />
      </Card>

      {questions.map((q, i) => (
        <Card key={q.id} style={{ gap: space.md }}>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <T style={{ flex: 1, fontWeight: '600' }}>
              {i + 1}. {q.prompt}
            </T>
            <T v="small" muted>
              {t('lwork.pts', { count: Number(q.points) })}
            </T>
          </View>
          <AnswerInput
            question={q}
            value={answers[q.id]}
            readOnly={readOnly}
            onDraft={(v) => {
              const next = { ...answers, [q.id]: v }
              setAnswers(next)
              queueSave(next)
            }}
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
        </Card>
      ))}

      <FormError error={err} />
    </Screen>
  )
}
