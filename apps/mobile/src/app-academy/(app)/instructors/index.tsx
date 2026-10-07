import { useMemo, useState } from 'react'
import { Stack, useRouter } from 'expo-router'
import { useT } from '@/lib/i18n'
import { useInstructors } from '@/features/instructors/api'
import { STATUS_META } from '@/features/instructors/status'
import { useScope } from '@/shell/scope'
import {
  Avatar,
  Badge,
  Card,
  Empty,
  ErrorBlock,
  Loading,
  Row,
  Screen,
  SearchInput,
} from '@/ui'

/** The instructor roster, to look somebody up. Managing them is a Director's, on the web. */
export default function InstructorsScreen() {
  const { t } = useT()
  const router = useRouter()
  const { academyId } = useScope()
  const { data, isLoading, error, refetch, isRefetching } = useInstructors(academyId)
  const [search, setSearch] = useState('')

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data ?? []).filter(
      (i) =>
        !q ||
        (i.full_name ?? '').toLowerCase().includes(q) ||
        (i.email ?? '').toLowerCase().includes(q) ||
        (i.phone ?? '').includes(q) ||
        (i.specialization ?? '').toLowerCase().includes(q) ||
        i.instructor_no.toLowerCase().includes(q),
    )
  }, [data, search])

  return (
    <Screen onRefresh={() => void refetch()} refreshing={isRefetching}>
      <Stack.Screen options={{ title: t('nav.instructors') }} />
      <SearchInput
        value={search}
        onChangeText={setSearch}
        placeholder={t('instructors.search_placeholder')}
      />
      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorBlock error={error} onRetry={() => void refetch()} />
      ) : rows.length === 0 ? (
        <Empty
          icon="users"
          title={search ? t('instructors.empty.no_match') : t('instructors.empty.none')}
        />
      ) : (
        <Card flush>
          {rows.map((ins, i) => (
            <Row
              key={ins.id}
              first={i === 0}
              left={
                <Avatar uri={ins.avatar_url} name={ins.full_name} email={ins.email} size={36} />
              }
              title={ins.full_name || ins.email || t('instructors.unnamed')}
              subtitle={[ins.instructor_no, ins.specialization].filter(Boolean).join(' · ')}
              right={
                ins.status === 'active' ? null : (
                  <Badge
                    label={t(STATUS_META[ins.status].labelKey)}
                    variant={STATUS_META[ins.status].variant}
                  />
                )
              }
              onPress={() => router.push(`/instructors/${ins.id}` as never)}
            />
          ))}
        </Card>
      )}
    </Screen>
  )
}
