import { useState } from 'react'
import { View } from 'react-native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useAuth } from '@/lib/auth'
import { IS_STUDENT_APP } from '@/lib/env'
import { errorMessage } from '@/lib/errors'
import { fmtDateTime, personName } from '@/lib/format'
import { useT, type TFn } from '@/lib/i18n'
import { useOpenFile } from '@/features/files/api'
import { FileLine, PendingFiles } from '@/features/files/Attach'
import {
  REPORT_STATUS,
  VERDICTS,
  useCommentOnReport,
  useReassignReport,
  useReport,
  useSubmitReport,
  type PendingFile,
  type ReportEvent,
  type ReportStatus,
} from '@/features/reports/api'
import { useScope } from '@/shell/scope'
import {
  Badge,
  Button,
  Card,
  Divider,
  ErrorBlock,
  Field,
  FormError,
  Input,
  Loading,
  Menu,
  Screen,
  Sheet,
  T,
  space,
} from '@/ui'

/**
 * One LPKC thread, for whoever is reading it.
 *
 * The same screen in both apps, as `ReportThreadView` is the same component on
 * both web routes. It works out for itself what the reader may do from the
 * server's `my_role`, so the rule lives in the database and cannot drift
 * between the two apps (docs/report-checks.md → "Who may see and do what").
 *
 * The timeline is oldest first: this is a conversation, and the reply box sits
 * at the end of it, where what you are about to add will appear.
 */

function headline(e: ReportEvent, t: TFn): string {
  const who = e.actor_name?.trim() || t('report.someone')
  if (e.kind === 'submitted') {
    return e.version && e.version > 1
      ? t('report.event.resubmitted', { who, version: e.version })
      : t('report.event.submitted', { who })
  }
  if (e.kind === 'assigned') {
    return t('report.event.assigned', { who, to: e.body ?? t('report.someone') })
  }
  if (e.kind === 'status' || (e.kind === 'comment' && e.to_status)) {
    return t('report.event.decided', { who })
  }
  return t('report.event.commented', { who })
}

export function ReportThreadScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>()
  const { t } = useT()
  const router = useRouter()
  const { user } = useAuth()
  const { academyId } = useScope()
  const { data: report, isLoading, error, refetch, isRefetching } = useReport(id)
  const comment = useCommentOnReport(academyId)
  const reassign = useReassignReport(academyId)
  const submit = useSubmitReport(academyId)
  const openFile = useOpenFile()

  const [body, setBody] = useState('')
  const [files, setFiles] = useState<PendingFile[]>([])
  const [failure, setFailure] = useState<string | null>(null)

  // "Send a new version" — the student's one action besides replying.
  const [again, setAgain] = useState(false)
  const [title, setTitle] = useState('')
  const [newFiles, setNewFiles] = useState<PendingFile[]>([])

  if (isLoading) {
    return (
      <Screen>
        <Stack.Screen options={{ title: t('nav.reports') }} />
        <Loading />
      </Screen>
    )
  }
  if (error || !report) {
    return (
      <Screen>
        <Stack.Screen options={{ title: t('nav.reports') }} />
        <ErrorBlock error={error ?? new Error(t('common.not_found'))} />
      </Screen>
    )
  }

  const status = REPORT_STATUS[report.status]
  const isStudent = report.my_role === 'student'
  const isAdmin = report.my_role === 'admin'
  const done = report.status === 'approved'
  const busy = comment.isPending || reassign.isPending
  const nothingToSay = body.trim() === '' && files.length === 0

  async function post(toStatus: ReportStatus | null) {
    setFailure(null)
    try {
      await comment.mutateAsync({ reportId: id, body, toStatus, files })
      setBody('')
      setFiles([])
    } catch (e) {
      setFailure(errorMessage(e, t('common.error')))
    }
  }

  async function handOn() {
    setFailure(null)
    try {
      await reassign.mutateAsync({ reportId: id, instructorId: null })
    } catch (e) {
      setFailure(errorMessage(e, t('common.error')))
    }
  }

  async function sendAgain() {
    if (!report) return
    setFailure(null)
    try {
      await submit.mutateAsync({
        courseId: report.course.id,
        title: title.trim() || report.title,
        files: newFiles,
      })
      setAgain(false)
      setNewFiles([])
    } catch (e) {
      setFailure(errorMessage(e, t('common.error')))
    }
  }

  return (
    <Screen onRefresh={() => void refetch()} refreshing={isRefetching}>
      <Stack.Screen
        options={{
          title: t('nav.reports'),
          headerRight: () =>
            isStudent ? null : (
              <Menu
                label={t('common.actions')}
                items={[
                  {
                    label: t('report.hand_on'),
                    icon: 'corner-up-right',
                    onPress: () => void handOn(),
                  },
                  ...(IS_STUDENT_APP
                    ? []
                    : [
                        {
                          label: t('report.open_student'),
                          icon: 'user' as const,
                          onPress: () =>
                            router.push(`/students/${report.student.id}` as never),
                        },
                      ]),
                ]}
              />
            ),
        }}
      />

      <View style={{ gap: 6 }}>
        <T v="title">{report.title}</T>
        <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
          <Badge label={t(status.labelKey)} tone={status.tone} />
          {report.version > 1 ? (
            <Badge label={t('report.version', { version: report.version })} />
          ) : null}
        </View>
        <T v="small" muted>
          {report.course.title}
          {' · '}
          {/* On the student's side the checker's name is the one fact they
              cannot get anywhere else: `instructors` is staff-only. */}
          {isStudent
            ? t('report.checked_by', {
                name:
                  personName(report.instructor?.full_name) ??
                  t('report.unassigned'),
              })
            : `${personName(report.student.full_name) ?? t('common.unnamed')}${
                report.student.student_no ? ` · ${report.student.student_no}` : ''
              }`}
        </T>
        <T v="small" muted>
          {t('report.submitted_at', { when: fmtDateTime(report.submitted_at) })}
        </T>
      </View>

      {isStudent && !done ? (
        <Button
          icon="upload"
          title={t('report.resubmit')}
          onPress={() => {
            setTitle(report.title)
            setAgain(true)
          }}
        />
      ) : null}

      <Card style={{ gap: space.lg }}>
        {report.events.map((e, i) => {
          const mine = !!user && e.actor_id === user.id
          const to = e.to_status ? REPORT_STATUS[e.to_status] : null
          return (
            <View key={e.id} style={{ gap: 6 }}>
              {i > 0 ? <Divider /> : null}
              <View style={{ gap: 2, paddingTop: i > 0 ? space.md : 0 }}>
                <T v="small" style={{ fontWeight: '500' }}>
                  {headline(e, t)}
                  {mine ? ` ${t('report.event.you')}` : ''}
                </T>
                <T v="tiny" muted>
                  {fmtDateTime(e.created_at)}
                </T>
              </View>
              {to ? <Badge label={t(to.labelKey)} tone={to.tone} /> : null}
              {/* For a handover the body is the name it went to, which the
                  headline already says. */}
              {e.body && e.kind !== 'assigned' ? <T>{e.body}</T> : null}
              {e.files.map((f) => (
                <FileLine
                  key={f.id}
                  name={f.file_name}
                  size={f.size_bytes}
                  busy={openFile.isPending}
                  onOpen={() => openFile.mutate({ kind: 'report', id: f.id })}
                />
              ))}
            </View>
          )
        })}

        <Divider />

        <Input
          value={body}
          onChangeText={setBody}
          multiline
          editable={!busy}
          placeholder={
            isStudent ? t('report.reply.student') : t('report.reply.staff')
          }
        />
        {academyId ? (
          <PendingFiles
            academyId={academyId}
            files={files}
            onChange={setFiles}
            disabled={busy}
          />
        ) : null}

        {/* The three verdicts are three buttons, not a picker and a Save: a
            verdict is one decision and pressing it is the whole act. */}
        {!isStudent ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {VERDICTS.map((v) => (
              <Button
                key={v}
                small
                variant={v === 'approved' ? 'primary' : 'outline'}
                title={t(REPORT_STATUS[v].labelKey)}
                disabled={busy || report.status === v}
                onPress={() => void post(v)}
              />
            ))}
          </View>
        ) : null}

        <Button
          icon="send"
          variant={isStudent ? 'primary' : 'outline'}
          title={t('report.send')}
          loading={comment.isPending}
          disabled={busy || nothingToSay}
          onPress={() => void post(null)}
        />
        <FormError error={failure} />
        <FormError error={openFile.error ? t('report.no_url') : null} />

        {isAdmin && report.instructor ? (
          <T v="small" muted>
            {t('report.assigned_to', {
              name:
                personName(report.instructor.full_name) ?? t('common.unnamed'),
            })}
          </T>
        ) : null}
      </Card>

      <Sheet
        visible={again}
        onClose={() => setAgain(false)}
        title={t('report.submit.title_again')}
      >
        <T v="small" muted>
          {t('report.submit.desc_again', { version: report.version + 1 })}
        </T>
        <Field label={t('report.submit.what')} hint={t('report.submit.what_hint')}>
          <Input value={title} onChangeText={setTitle} />
        </Field>
        <Field label={t('report.submit.files')}>
          {academyId ? (
            <PendingFiles
              academyId={academyId}
              files={newFiles}
              onChange={setNewFiles}
              disabled={submit.isPending}
            />
          ) : null}
        </Field>
        <FormError error={failure} />
        <Button
          title={
            submit.isPending ? t('report.submit.sending') : t('report.submit.send')
          }
          loading={submit.isPending}
          disabled={newFiles.length === 0}
          onPress={() => void sendAgain()}
        />
      </Sheet>
    </Screen>
  )
}
