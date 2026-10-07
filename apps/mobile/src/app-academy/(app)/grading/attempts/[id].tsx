import { useEffect, useMemo, useState } from 'react'
import { View } from 'react-native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { errorMessage } from '@/lib/errors'
import { fmtDateTime } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { earnedPoints, type AnswerValue } from '@/lib/questions'
import { AnswerReview, type ReviewQuestion } from '@/features/grading/AnswerReview'
import {
  useAttemptQuestions,
  useGradeAttempt,
  useGradingAttempt,
} from '@/features/grading/api'
import { ATTEMPT_STATUS_META } from '@/features/learn/status'
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorBlock,
  Field,
  FormError,
  Input,
  Loading,
  Screen,
  T,
  space,
} from '@/ui'

/**
 * Mark one assessment attempt.
 *
 * The objective questions are already scored by the database; each shows what
 * it earned. The written ones are the grader's, and the single score box at
 * the bottom is what is saved — pre-filled, on request, with the automatic part
 * so the grader adds to it rather than starting from zero.
 */
export default function GradeAttemptScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>()
  const { t, tn } = useT()
  const router = useRouter()
  const { data: attempt, isLoading, error } = useGradingAttempt(id)
  const { data: questions } = useAttemptQuestions(attempt?.assessment_id)
  const grade = useGradeAttempt(id)
  const [score, setScore] = useState('')
  const [seeded, setSeeded] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const list = useMemo(() => (questions ?? []) as ReviewQuestion[], [questions])
  const answers = useMemo(
    () => (attempt?.answers ?? {}) as Record<string, AnswerValue>,
    [attempt],
  )
  const maxScore = useMemo(
    () => list.reduce((sum, q) => sum + Number(q.points ?? 0), 0),
    [list],
  )
  const auto = useMemo(() => {
    let scored = 0
    let manual = 0
    let autoMax = 0
    for (const q of list) {
      const earned = earnedPoints(q.question_type, q.correct_answer, answers[q.id], q.points)
      if (earned === null) manual += Number(q.points ?? 0)
      else {
        scored += earned
        autoMax += Number(q.points ?? 0)
      }
    }
    return { scored: Math.round(scored * 100) / 100, manual, autoMax }
  }, [list, answers])

  useEffect(() => {
    if (seeded || !attempt) return
    setScore(attempt.score == null ? '' : String(attempt.score))
    setSeeded(true)
  }, [seeded, attempt])

  if (isLoading) return <Loading />
  if (error || !attempt) {
    return <ErrorBlock error={error ?? new Error(t('grading.attempt.unavailable'))} />
  }

  const student = attempt.students
  const name = student?.full_name?.trim() || student?.student_no || t('common.student')

  async function save() {
    setErr(null)
    const n = Number(score)
    if (score.trim() === '' || !Number.isFinite(n) || n < 0) {
      setErr(t('grading.error.invalid_mark'))
      return
    }
    try {
      await grade.mutateAsync({ score: n, maxScore })
      router.back()
    } catch (e) {
      setErr(errorMessage(e, t('grading.error.save_failed')))
    }
  }

  return (
    <Screen
      footer={
        <>
          <Field label={t('grading.score_out_of', { max: maxScore })}>
            <Input value={score} onChangeText={setScore} keyboardType="decimal-pad" />
          </Field>
          <FormError error={err} />
          <Button
            title={grade.isPending ? t('common.saving') : t('grading.save_mark')}
            loading={grade.isPending}
            onPress={() => void save()}
          />
        </>
      }
    >
      <Stack.Screen options={{ title: t('grading.item.assessment') }} />
      <View style={{ gap: 6 }}>
        <T v="title">{name}</T>
        <Badge
          label={t(ATTEMPT_STATUS_META[attempt.status].labelKey)}
          variant={ATTEMPT_STATUS_META[attempt.status].variant}
        />
        <T v="small" muted>
          {t('grading.attempt.meta', {
            title: attempt.assessments?.title ?? '',
            no: attempt.attempt_no,
            when: fmtDateTime(attempt.submitted_at),
          })}
        </T>
      </View>

      {list.length === 0 ? (
        <Empty title={t('grading.attempt.no_questions')} />
      ) : (
        <>
          {auto.autoMax > 0 ? (
            <Card style={{ gap: space.sm }}>
              <T v="small" muted>
                {t('grading.attempt.auto_summary', {
                  scored: auto.scored,
                  auto: auto.autoMax,
                  manual: auto.manual,
                })}
              </T>
              <View style={{ flexDirection: 'row' }}>
                <Button
                  small
                  variant="outline"
                  title={t('grading.attempt.use_auto', { scored: auto.scored })}
                  onPress={() => setScore(String(auto.scored))}
                />
              </View>
            </Card>
          ) : null}

          {list.map((q, i) => {
            const earned = earnedPoints(
              q.question_type,
              q.correct_answer,
              answers[q.id],
              q.points,
            )
            return (
              <Card key={q.id} style={{ gap: space.md }}>
                <View style={{ flexDirection: 'row', gap: space.sm }}>
                  <T style={{ flex: 1, fontWeight: '600' }}>
                    {i + 1}. {q.prompt}
                  </T>
                  <T v="small" muted>
                    {earned === null
                      ? tn('grading.points', Number(q.points))
                      : t('grading.attempt.auto_earned', {
                          earned,
                          max: Number(q.points),
                        })}
                  </T>
                </View>
                <AnswerReview question={q} answer={answers[q.id]} />
                {earned === null ? (
                  <T v="small" tone="warning">
                    {t('grading.attempt.manual')}
                  </T>
                ) : null}
              </Card>
            )
          })}
          <T v="small" muted>
            {t('grading.attempt.release_hint')}
          </T>
        </>
      )}
    </Screen>
  )
}
