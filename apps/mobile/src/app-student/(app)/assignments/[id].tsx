import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { Stack, useLocalSearchParams } from 'expo-router'
import { errorMessage } from '@/lib/errors'
import { fmtDateTime } from '@/lib/format'
import { useT } from '@/lib/i18n'
import type { UploadFile } from '@/lib/storage'
import {
  useAttachSubmissionFiles,
  useOpenFile,
  useRemoveSubmissionFile,
  useSubmissionFiles,
} from '@/features/files/api'
import { AttachButton, FileLine } from '@/features/files/Attach'
import {
  useDeleteSubmission,
  useLearnAssignment,
  useMySubmission,
  useSaveSubmission,
} from '@/features/learn/api'
import { LearnerGate } from '@/features/learn/context'
import { SUBMISSION_STATUS_META } from '@/features/learn/status'
import {
  Badge,
  Button,
  Card,
  confirm,
  ErrorBlock,
  FormError,
  Input,
  Loading,
  Screen,
  T,
  space,
} from '@/ui'
import { BlocksView } from '@/ui/Blocks'

export default function AssignmentScreen() {
  const { t } = useT()
  return (
    <>
      <Stack.Screen options={{ title: t('learn.kind.assignment') }} />
      <LearnerGate>
        {({ academyId, studentId }) => (
          <Assignment academyId={academyId} studentId={studentId} />
        )}
      </LearnerGate>
    </>
  )
}

/**
 * One assignment: the brief, the student's answer, and what came back.
 *
 * The text follows the web page (`LearnAssignmentPage`) rule for rule. What is
 * new here is **attachments** — photographs of written work, or a document —
 * which the web app listed as not built. A file can only be attached to a
 * hand-in that exists, so attaching the first one saves the draft first; and
 * like the text, files are frozen the moment the work is handed in.
 */
function Assignment({ academyId, studentId }: { academyId: string; studentId: string }) {
  const { id = '' } = useLocalSearchParams<{ id: string }>()
  const { t, tn } = useT()
  const { data: assignment, isLoading, error } = useLearnAssignment(id)
  const { data: submission, isPending: submissionPending } = useMySubmission(
    id,
    studentId,
  )
  const save = useSaveSubmission(academyId, id, studentId)
  const remove = useDeleteSubmission(id, studentId)
  const { data: files } = useSubmissionFiles(submission?.id)
  const attach = useAttachSubmissionFiles(academyId)
  const detach = useRemoveSubmissionFile(submission?.id ?? '')
  const openFile = useOpenFile()

  const [content, setContent] = useState('')
  const [seeded, setSeeded] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Seed once, when the submission query has answered. Seeding on every
  // refetch would overwrite what is being typed.
  useEffect(() => {
    if (seeded || submissionPending) return
    setContent(submission?.content ?? '')
    setSeeded(true)
  }, [seeded, submissionPending, submission])

  if (isLoading || submissionPending) return <Loading />
  if (error || !assignment) {
    return (
      <ErrorBlock error={error ?? new Error(t('lwork.assignment.not_available'))} />
    )
  }

  const status = submission?.status ?? 'draft'
  const meta = SUBMISSION_STATUS_META[status]
  // The UPDATE policy admits `status = 'draft'` only; anything else is
  // read-only at the database, including a returned hand-in.
  const locked = !!submission && status !== 'draft'
  const released = status === 'graded' || status === 'returned'
  const overdue =
    !!assignment.due_at &&
    !assignment.allow_late &&
    new Date(assignment.due_at) < new Date()
  const attached = files ?? []
  const hasWork = !!content.trim() || attached.length > 0
  const busy = save.isPending || attach.isPending
  const canSubmit = !locked && !overdue && hasWork && !busy

  async function run(submit: boolean) {
    setErr(null)
    try {
      await save.mutateAsync({ id: submission?.id, content, submit })
    } catch (e) {
      setErr(errorMessage(e, t('lwork.assignment.error.save')))
    }
  }

  async function onSubmit() {
    const ok = await confirm({
      title: t('lwork.assignment.confirm_submit.title'),
      message: t('lwork.assignment.confirm_submit.body'),
      confirmLabel: t('common.submit'),
      cancelLabel: t('common.cancel'),
    })
    if (ok) await run(true)
  }

  async function onDiscard() {
    if (!submission) return
    const ok = await confirm({
      title: t('lwork.assignment.confirm_delete.title'),
      message: t('lwork.assignment.confirm_delete.body'),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    })
    if (!ok) return
    setErr(null)
    try {
      await remove.mutateAsync(submission.id)
      setContent('')
    } catch (e) {
      setErr(errorMessage(e, t('lwork.assignment.error.delete')))
    }
  }

  async function onAttach(picked: UploadFile[]) {
    setErr(null)
    try {
      // The first file needs somewhere to hang: save the draft, then attach.
      const row =
        submission ?? (await save.mutateAsync({ content, submit: false }))
      await attach.mutateAsync({ submissionId: row.id, files: picked })
    } catch (e) {
      setErr(errorMessage(e, t('upload.failed')))
    }
  }

  return (
    <Screen
      footer={
        locked ? null : (
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button
              style={{ flex: 1 }}
              variant="outline"
              title={t('lwork.assignment.save_draft')}
              loading={save.isPending}
              disabled={busy}
              onPress={() => void run(false)}
            />
            <Button
              style={{ flex: 1 }}
              title={t('common.submit')}
              disabled={!canSubmit}
              onPress={() => void onSubmit()}
            />
          </View>
        )
      }
    >
      <Stack.Screen options={{ title: t('learn.kind.assignment') }} />
      <View style={{ gap: 6 }}>
        <T v="title">{assignment.title}</T>
        <Badge label={t(meta.labelKey)} variant={meta.variant} />
        <T v="small" muted>
          {[
            tn('lwork.points', Number(assignment.total_points)),
            assignment.due_at
              ? t('lwork.due_at', { date: fmtDateTime(assignment.due_at) })
              : null,
            assignment.allow_late ? t('lwork.late_allowed') : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </T>
      </View>

      <Card style={{ gap: space.md }}>
        <T v="heading">{t('lwork.assignment.brief')}</T>
        <BlocksView body={assignment.instructions} />
      </Card>

      {released ? (
        <Card style={{ gap: space.sm }}>
          <T v="heading">{t('lwork.assignment.result')}</T>
          <T>
            <T bold>{submission?.grade ?? '—'}</T>
            <T muted> / {Number(assignment.total_points)}</T>
          </T>
          <T muted={!submission?.feedback}>
            {submission?.feedback || t('lwork.assignment.no_feedback')}
          </T>
        </Card>
      ) : null}

      <Card style={{ gap: space.md }}>
        <T v="heading">{t('lwork.assignment.your_submission')}</T>
        <Input
          multiline
          value={content}
          editable={!locked}
          onChangeText={setContent}
          placeholder={t('lwork.assignment.answer_placeholder')}
          style={{ minHeight: 160 }}
        />

        {attached.map((f) => (
          <FileLine
            key={f.id}
            name={f.file_name}
            size={f.size_bytes}
            busy={openFile.isPending || detach.isPending}
            onOpen={() => openFile.mutate({ kind: 'submission', id: f.id })}
            onRemove={locked ? undefined : () => detach.mutate(f.id)}
          />
        ))}
        {!locked ? (
          <View style={{ flexDirection: 'row' }}>
            <AttachButton
              label={
                attach.isPending ? t('report.file.uploading') : t('report.file.attach')
              }
              busy={attach.isPending}
              disabled={busy || attached.length >= 10}
              onPick={(picked) => void onAttach(picked)}
            />
          </View>
        ) : null}

        {submission?.submitted_at ? (
          <T v="small" muted>
            {t('lwork.assignment.submitted_at', {
              date: fmtDateTime(submission.submitted_at),
            })}
          </T>
        ) : null}
        <FormError error={err} />
        <FormError
          error={
            detach.error ? errorMessage(detach.error, t('common.error')) : null
          }
        />
        <FormError error={openFile.error ? t('material.no_url') : null} />
        {overdue && !locked ? (
          <T v="small" tone="danger">
            {t('lwork.assignment.overdue')}
          </T>
        ) : null}
        {locked ? (
          <T v="small" muted>
            {status === 'returned'
              ? t('lwork.assignment.locked_returned')
              : t('lwork.assignment.locked_submitted')}
          </T>
        ) : submission ? (
          <View style={{ flexDirection: 'row' }}>
            <Button
              small
              variant="ghost"
              title={t('lwork.assignment.delete_draft')}
              onPress={() => void onDiscard()}
            />
          </View>
        ) : null}
      </Card>
    </Screen>
  )
}
