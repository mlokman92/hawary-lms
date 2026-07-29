import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { fmtDateTime } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { useGradeSubmission, useGradingSubmission } from '@/features/grading/api'
import { SUBMISSION_STATUS_META } from '@/features/learn/status'
import { BlocksView } from '@/components/BlocksView'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export function GradeSubmissionPage() {
  const { id = '' } = useParams<{ id: string }>()
  const { t } = useT()
  const { data, isLoading, error } = useGradingSubmission(id)
  const grade = useGradeSubmission(id)

  const [score, setScore] = useState('')
  const [feedback, setFeedback] = useState('')
  const [seeded, setSeeded] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (seeded || !data) return
    setScore(data.grade == null ? '' : String(data.grade))
    setFeedback(data.feedback ?? '')
    setSeeded(true)
  }, [seeded, data])

  if (isLoading) {
    return (
      <p className="text-muted-foreground py-16 text-center text-sm">
        {t('common.loading')}
      </p>
    )
  }
  if (error || !data) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <p className="text-muted-foreground text-sm">
          {t('grading.submission.unavailable')}
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/courses">{t('grading.back_to_courses')}</Link>
        </Button>
      </div>
    )
  }

  const max = data.assignments?.total_points ?? 100
  const student = data.students
  const name =
    student?.full_name?.trim() || student?.student_no || t('common.student')

  async function save(release: boolean) {
    setErr(null)
    const n = Number(score)
    if (!Number.isFinite(n) || n < 0) {
      setErr(t('grading.error.invalid_mark'))
      return
    }
    try {
      await grade.mutateAsync({ grade: n, feedback, release })
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('grading.error.save_failed'))
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to={`/courses/${data.assignments?.course_id ?? ''}/grading`}>
          <ArrowLeft /> {t('grading.title')}
        </Link>
      </Button>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
          <Badge variant="secondary">
            {t(SUBMISSION_STATUS_META[data.status].labelKey)}
          </Badge>
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          {t('grading.submission.meta', {
            title: data.assignments?.title ?? '',
            when: fmtDateTime(data.submitted_at),
          })}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('grading.submission.brief')}</CardTitle>
        </CardHeader>
        <CardContent>
          <BlocksView body={data.assignments?.instructions} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('grading.submission.work')}</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Plain text, never HTML: this is student-authored content and the
              grader's session is the one that can read every answer key. */}
          <p className="text-sm leading-7 whitespace-pre-line">
            {data.content?.trim() || t('grading.submission.no_text')}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('grading.mark')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:max-w-48">
            <Label htmlFor="grade">{t('grading.mark_out_of', { max })}</Label>
            <Input
              id="grade"
              type="number"
              min="0"
              step="0.5"
              value={score}
              onChange={(e) => setScore(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="feedback">{t('grading.feedback')}</Label>
            <Textarea
              id="feedback"
              rows={6}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder={t('grading.feedback_placeholder')}
            />
          </div>
          {err ? <p className="text-destructive text-sm">{err}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={grade.isPending}
              onClick={() => void save(false)}
            >
              {t('grading.save_mark')}
            </Button>
            <Button disabled={grade.isPending} onClick={() => void save(true)}>
              {grade.isPending ? t('common.saving') : t('grading.save_and_return')}
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">{t('grading.return_hint')}</p>
        </CardContent>
      </Card>
    </div>
  )
}
