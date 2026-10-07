import { useMemo, useState } from 'react'
import { useRouter } from 'expo-router'
import { useT } from '@/lib/i18n'
import { useStudents } from '@/features/students/api'
import { STATUS_META } from '@/features/students/status'
import { StudentForm } from '@/features/students/StudentForm'
import { useScope } from '@/shell/scope'
import {
  Avatar,
  Badge,
  Button,
  Card,
  Empty,
  ErrorBlock,
  Loading,
  Row,
  Screen,
  SearchInput,
} from '@/ui'

/** How many rows are drawn before the list asks for a search instead. */
const SHOWN = 60

/**
 * The student roster. Search is the way in: it matches the same fields as the
 * web app's header search (name, email, phone, IC, student number), which is
 * how staff actually find a person — nobody scrolls 700 rows on a phone.
 */
export default function StudentsTab() {
  const { t } = useT()
  const router = useRouter()
  const { academyId } = useScope()
  const { data, isLoading, error, refetch, isRefetching } = useStudents(academyId)
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)

  const rows = useMemo(() => {
    const all = data ?? []
    const q = search.trim().toLowerCase()
    if (!q) return all
    const digits = q.replace(/\D/g, '')
    return all.filter(
      (s) =>
        (s.full_name ?? '').toLowerCase().includes(q) ||
        (s.email ?? '').toLowerCase().includes(q) ||
        s.student_no.toLowerCase().includes(q) ||
        (!!digits &&
          ((s.phone ?? '').replace(/\D/g, '').includes(digits) ||
            (s.ic_number ?? '').replace(/\D/g, '').includes(digits))),
    )
  }, [data, search])

  return (
    <Screen onRefresh={() => void refetch()} refreshing={isRefetching}>
      <SearchInput
        value={search}
        onChangeText={setSearch}
        placeholder={t('students.search_placeholder')}
      />
      <Button
        variant="outline"
        icon="user-plus"
        title={t('students.action.add')}
        onPress={() => setAdding(true)}
      />

      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorBlock error={error} onRetry={() => void refetch()} />
      ) : rows.length === 0 ? (
        <Empty
          icon="users"
          title={search ? t('students.empty.no_match') : t('students.empty.none')}
        />
      ) : (
        <Card flush>
          {rows.slice(0, SHOWN).map((s, i) => {
            const active = s.enrollments
              .filter((e) => e.status === 'active')
              .map((e) => e.courses?.title)
              .filter(Boolean)
            return (
              <Row
                key={s.id}
                first={i === 0}
                left={
                  <Avatar uri={s.avatar_url} name={s.full_name} email={s.email} size={36} />
                }
                title={s.full_name || s.email || t('students.unnamed')}
                subtitle={[s.student_no, active.join(', ') || null]
                  .filter(Boolean)
                  .join(' · ')}
                right={
                  s.status === 'active' ? null : (
                    <Badge
                      label={t(STATUS_META[s.status].labelKey)}
                      variant={STATUS_META[s.status].variant}
                    />
                  )
                }
                onPress={() => router.push(`/students/${s.id}` as never)}
              />
            )
          })}
        </Card>
      )}

      {academyId ? (
        <StudentForm
          academyId={academyId}
          visible={adding}
          onClose={() => setAdding(false)}
          onCreated={(id) => router.push(`/students/${id}` as never)}
        />
      ) : null}
    </Screen>
  )
}
