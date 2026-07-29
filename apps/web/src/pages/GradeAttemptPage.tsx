import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { fmtDateTime } from '@/lib/format'
import { useT } from '@/lib/i18n'
import {
  useAttemptQuestions,
  useGradeAttempt,
  useGradingAttempt,
} from '@/features/grading/api'
import { ATTEMPT_STATUS_META } from '@/features/learn/status'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function GradeAttemptPage() {
  const { id = '' } = useParams<{ id: string }>()
  const { t, tn } = useT()
  const { data: attempt, isLoading, error } = useGradingAttempt(id)
  const { data: questions } = useAttemptQuestions(attempt?.assessment_id)
  const grade = useGradeAttempt(id)

  const [score, setScore] = useState('')
  const [seeded, setSeeded] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // max_score is the sum of question marks — one denominator, decided here, so
  // the student sees the same total the grader marked against.
  const maxScore = useMemo(
    () => (questions ?? []).reduce((sum, q) => sum + Number(q.points ?? 0), 0),
    [questions],
  )

  useEffect(() => {
    if (seeded || !attempt) return
    setScore(attempt.score == null ? '' : String(attempt.score))
    setSeeded(true)
  }, [seeded, attempt])

  if (isLoading) {
    return (
      <p className="text-muted-foreground py-16 text-center text-sm">
        {t('common.loading')}
      </p>
    )
  }
  if (error || !attempt) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <p className="text-muted-foreground text-sm">
          {t('grading.attempt.unavailable')}
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/courses">{t('grading.back_to_courses')}</Link>
        </Button>
      </div>
    )
  }

  const student = attempt.students
  const name =
    student?.full_name?.trim() || student?.student_no || t('common.student')
  const answers = (attempt.answers ?? {}) as Record<string, string>

  async function save() {
    setErr(null)
    const n = Number(score)
    if (!Number.isFinite(n) || n < 0) {
      setErr(t('grading.error.invalid_mark'))
      return
    }
    try {
      await grade.mutateAsync({ score: n, maxScore })
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('grading.error.save_failed'))
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to={`/courses/${attempt.assessments?.course_id ?? ''}/grading`}>
          <ArrowLeft /> {t('grading.title')}
        </Link>
      </Button>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
          <Badge variant="secondary">
            {t(ATTEMPT_STATUS_META[attempt.status].labelKey)}
          </Badge>
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          {t('grading.attempt.meta', {
            title: attempt.assessments?.title ?? '',
            no: attempt.attempt_no,
            when: fmtDateTime(attempt.submitted_at),
          })}
        </p>
      </div>

      <div className="space-y-4">
        {(questions ?? []).map((q, i) => (
          <Card key={q.id}>
            <CardHeader className="gap-1">
              <div className="flex items-start justify-between gap-3">
                <CardTitle className="text-base">
                  {i + 1}. {q.prompt}
                </CardTitle>
                <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                  {tn('grading.points', q.points)}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              {/* Student-authored: plain text only. */}
              <p className="bg-muted/40 rounded-md border p-3 text-sm leading-7 whitespace-pre-line">
                {answers[q.id]?.trim() || t('grading.attempt.no_answer')}
              </p>
            </CardContent>
          </Card>
        ))}
        {(questions ?? []).length === 0 ? (
          <p className="text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm">
            {t('grading.attempt.no_questions')}
          </p>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('grading.mark')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:max-w-48">
            <Label htmlFor="score">
              {t('grading.score_out_of', { max: maxScore })}
            </Label>
            <Input
              id="score"
              type="number"
              min="0"
              step="0.5"
              value={score}
              onChange={(e) => setScore(e.target.value)}
            />
          </div>
          {err ? <p className="text-destructive text-sm">{err}</p> : null}
          <Button disabled={grade.isPending} onClick={() => void save()}>
            {grade.isPending ? t('common.saving') : t('grading.save_mark')}
          </Button>
          <p className="text-muted-foreground text-xs">
            {t('grading.attempt.release_hint')}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
