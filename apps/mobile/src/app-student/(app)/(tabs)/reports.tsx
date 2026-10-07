import { useState } from 'react'
import { useRouter } from 'expo-router'
import { errorMessage } from '@/lib/errors'
import { fmtDateTime } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { PendingFiles } from '@/features/files/Attach'
import {
  REPORT_STATUS,
  useMyReports,
  useSubmitReport,
  type MyReportRow,
  type PendingFile,
} from '@/features/reports/api'
import { useScope } from '@/shell/scope'
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
  Row,
  Screen,
  Sheet,
  T,
} from '@/ui'

/**
 * The student's LPKC list: one row per enrolled course — keyed on enrolments,
 * not on reports, so a course with nothing sent is a row with a Send button
 * rather than an absence to interpret (docs/report-checks.md).
 */
export default function ReportsTab() {
  const { t } = useT()
  const router = useRouter()
  const { academyId } = useScope()
  const { data, isLoading, error, refetch, isRefetching } = useMyReports(academyId)
  const submit = useSubmitReport(academyId)

  const [target, setTarget] = useState<MyReportRow | null>(null)
  const [title, setTitle] = useState('')
  const [files, setFiles] = useState<PendingFile[]>([])
  const [failure, setFailure] = useState<string | null>(null)

  async function send() {
    if (!target) return
    setFailure(null)
    try {
      const res = await submit.mutateAsync({
        courseId: target.course_id,
        title: title.trim(),
        files,
      })
      setTarget(null)
      setTitle('')
      setFiles([])
      router.push(`/reports/${res.id}` as never)
    } catch (e) {
      setFailure(errorMessage(e, t('common.error')))
    }
  }

  const rows = data?.courses ?? []

  return (
    <Screen onRefresh={() => void refetch()} refreshing={isRefetching}>
      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorBlock error={error} onRetry={() => void refetch()} />
      ) : !data?.is_open ? (
        <Empty
          icon="clipboard"
          title={t('report.learn.closed')}
          body={t('report.learn.closed_hint')}
        />
      ) : rows.length === 0 ? (
        <Empty icon="clipboard" title={t('report.learn.no_courses')} />
      ) : (
        <Card flush>
          {rows.map((row, i) => {
            const r = row.report
            if (!r) {
              return (
                <Row
                  key={row.course_id}
                  first={i === 0}
                  title={row.course_title}
                  subtitle={t('report.learn.nothing_sent')}
                  right={
                    <Button
                      small
                      title={t('common.send')}
                      onPress={() => {
                        setFailure(null)
                        setTarget(row)
                      }}
                    />
                  }
                />
              )
            }
            const meta = REPORT_STATUS[r.status]
            return (
              <Row
                key={row.course_id}
                first={i === 0}
                title={r.title}
                subtitle={[
                  row.course_title,
                  r.instructor_name
                    ? t('report.checked_by', { name: r.instructor_name })
                    : null,
                  fmtDateTime(r.last_at),
                ]
                  .filter(Boolean)
                  .join(' · ')}
                right={<Badge label={t(meta.labelKey)} tone={meta.tone} />}
                onPress={() => router.push(`/reports/${r.id}` as never)}
              />
            )
          })}
        </Card>
      )}

      <Sheet
        visible={!!target}
        onClose={() => setTarget(null)}
        title={t('report.submit.title')}
      >
        <T v="small" muted>
          {t('report.submit.desc', { course: target?.course_title ?? '' })}
        </T>
        <Field label={t('report.submit.what')} hint={t('report.submit.what_hint')}>
          <Input value={title} onChangeText={setTitle} />
        </Field>
        <Field label={t('report.submit.files')}>
          {academyId ? (
            <PendingFiles
              academyId={academyId}
              files={files}
              onChange={setFiles}
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
          disabled={!title.trim() || files.length === 0}
          onPress={() => void send()}
        />
      </Sheet>
    </Screen>
  )
}
