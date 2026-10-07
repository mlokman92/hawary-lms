import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { errorMessage } from '@/lib/errors'
import { fmtDateTime } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { useOpenFile, useSubmissionFiles } from '@/features/files/api'
import { FileLine } from '@/features/files/Attach'
import { useGradeSubmission, useGradingSubmission } from '@/features/grading/api'
import { SUBMISSION_STATUS_META } from '@/features/learn/status'
import {
  Badge,
  Button,
  Card,
  ErrorBlock,
  Field,
  FormError,
  Input,
  Loading,
  Screen,
  T,
  space,
} from '@/ui'
import { BlocksView } from '@/ui/Blocks'

/**
 * Mark one assignment hand-in: the brief, what the student wrote, what they
 * attached, then a mark and feedback.
 *
 * Two ways to save, as on the web. "Save mark" keeps it with the grader;
 * "Save & return" is what releases the mark and feedback to the student — and,
 * since the mobile apps, what sends them a notification.
 */
export default function GradeSubmissionScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>()
  const { t } = useT()
  const router = useRouter()
  const { data: submission, isLoading, error } = useGradingSubmission(id)
  const { data: files } = useSubmissionFiles(id)
  const openFile = useOpenFile()
  const grade = useGradeSubmission(id)
  const [mark, setMark] = useState('')
  const [feedback, setFeedback] = useState('')
  const [seeded, setSeeded] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (seeded || !submission) return
    setMark(submission.grade == null ? '' : String(submission.grade))
    setFeedback(submission.feedback ?? '')
    setSeeded(true)
  }, [seeded, submission])

  if (isLoading) return <Loading />
  if (error || !submission) {
    return <ErrorBlock error={error ?? new Error(t('grading.submission.unavailable'))} />
  }

  const student = submission.students
  const name = student?.full_name?.trim() || student?.student_no || t('common.student')
  const max = Number(submission.assignments?.total_points ?? 0)
  const meta = SUBMISSION_STATUS_META[submission.status]

  async function save(release: boolean) {
    setErr(null)
    const n = Number(mark)
    if (mark.trim() === '' || !Number.isFinite(n) || n < 0) {
      setErr(t('grading.error.invalid_mark'))
      return
    }
    try {
      await grade.mutateAsync({ grade: n, feedback, release })
      router.back()
    } catch (e) {
      setErr(errorMessage(e, t('grading.error.save_failed')))
    }
  }

  return (
    <Screen
      footer={
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button
            style={{ flex: 1 }}
            variant="outline"
            title={t('grading.save_mark')}
            disabled={grade.isPending}
            onPress={() => void save(false)}
          />
          <Button
            style={{ flex: 1 }}
            title={t('grading.save_and_return')}
            loading={grade.isPending}
            onPress={() => void save(true)}
          />
        </View>
      }
    >
      <Stack.Screen options={{ title: t('grading.item.assignment') }} />
      <View style={{ gap: 6 }}>
        <T v="title">{name}</T>
        <Badge label={t(meta.labelKey)} variant={meta.variant} />
        <T v="small" muted>
          {t('grading.submission.meta', {
            title: submission.assignments?.title ?? '',
            when: fmtDateTime(submission.submitted_at),
          })}
        </T>
      </View>

      <Card style={{ gap: space.md }}>
        <T v="heading">{t('grading.submission.brief')}</T>
        <BlocksView body={submission.assignments?.instructions} />
      </Card>

      <Card style={{ gap: space.md }}>
        <T v="heading">{t('grading.submission.work')}</T>
        {submission.content?.trim() ? (
          <T>{submission.content}</T>
        ) : (
          <T muted>{t('grading.submission.no_text')}</T>
        )}
        {(files ?? []).map((f) => (
          <FileLine
            key={f.id}
            name={f.file_name}
            size={f.size_bytes}
            busy={openFile.isPending}
            onOpen={() => openFile.mutate({ kind: 'submission', id: f.id })}
          />
        ))}
        <FormError error={openFile.error ? t('material.no_url') : null} />
      </Card>

      <Card style={{ gap: space.md }}>
        <Field label={t('grading.mark_out_of', { max })}>
          <Input value={mark} onChangeText={setMark} keyboardType="decimal-pad" />
        </Field>
        <Field label={t('grading.feedback')} hint={t('grading.return_hint')}>
          <Input
            value={feedback}
            onChangeText={setFeedback}
            multiline
            placeholder={t('grading.feedback_placeholder')}
          />
        </Field>
        <FormError error={err} />
      </Card>
    </Screen>
  )
}
