import { Navigate } from 'react-router-dom'
import { MoreHorizontal } from 'lucide-react'
import { useAcademy } from '@/lib/academy'
import { useAuth } from '@/lib/auth'
import { useT, type TKey } from '@/lib/i18n'
import { useMembers, useUpdateMember } from '@/features/invitations/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type MemberRole = 'admin' | 'trainer' | 'student'
type MemberStatus = 'active' | 'invited' | 'suspended'

// Module constants, so they hold translation keys rather than copy — resolved
// with `t()` at render time.
const ROLE_LABEL: Record<MemberRole, TKey> = {
  admin: 'role.admin',
  trainer: 'role.trainer',
  student: 'role.student',
}

const ROLE_ACTION: Record<MemberRole, TKey> = {
  admin: 'settings.members.make_admin',
  trainer: 'settings.members.make_trainer',
  student: 'settings.members.make_student',
}

const STATUS_LABEL: Record<MemberStatus, TKey> = {
  active: 'settings.members.status.active',
  invited: 'settings.members.status.invited',
  suspended: 'settings.members.status.suspended',
}

/**
 * Admin-only membership management.
 *
 * accept_invitation's role ladder only ever escalates (admin > trainer >
 * student, never down), so without this a student later invited as an
 * instructor is a trainer forever. This is also the only way to suspend access.
 */
export function MembersPage() {
  const { activeAcademyId, active } = useAcademy()
  const { user } = useAuth()
  const { t } = useT()
  const { data: members, isLoading } = useMembers(activeAcademyId)
  const update = useUpdateMember(activeAcademyId)

  if (active && active.role !== 'admin') return <Navigate to="/" replace />

  const admins = (members ?? []).filter(
    (m) => m.role === 'admin' && m.status === 'active',
  ).length

  return (
    <div className="mx-auto w-full max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">
        {t('settings.members.title')}
      </h1>
      <p className="text-muted-foreground mt-1 text-sm">
        {t('settings.members.subtitle')}
      </p>

      <div className="mt-6 rounded-xl border">
        {isLoading ? (
          <p className="text-muted-foreground p-8 text-center text-sm">
            {t('common.loading')}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('settings.members.col.person')}</TableHead>
                <TableHead>{t('common.role')}</TableHead>
                <TableHead>{t('common.status')}</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(members ?? []).map((m) => {
                const isSelf = m.user_id === user?.id
                // Never let the last active admin demote or suspend themselves
                // out of the academy — that state needs database access to undo.
                const lastAdmin =
                  m.role === 'admin' && m.status === 'active' && admins <= 1
                return (
                  <TableRow key={m.user_id}>
                    <TableCell>
                      <div className="font-medium">
                        {m.profiles?.full_name?.trim() || t('common.unnamed')}
                        {isSelf ? (
                          <span className="text-muted-foreground">
                            {' '}
                            {t('settings.members.you')}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="capitalize">
                      {t(ROLE_LABEL[m.role])}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={m.status === 'active' ? 'default' : 'outline'}
                        className="capitalize"
                      >
                        {t(STATUS_LABEL[m.status])}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm">
                            <MoreHorizontal />
                            <span className="sr-only">
                              {t('settings.members.actions')}
                            </span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {(['admin', 'trainer', 'student'] as const).map((r) => (
                            <DropdownMenuItem
                              key={r}
                              disabled={m.role === r || (lastAdmin && r !== 'admin')}
                              onClick={() =>
                                update.mutate({ userId: m.user_id, patch: { role: r } })
                              }
                            >
                              {t(ROLE_ACTION[r])}
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuSeparator />
                          {m.status === 'active' ? (
                            <DropdownMenuItem
                              variant="destructive"
                              disabled={lastAdmin}
                              onClick={() =>
                                update.mutate({
                                  userId: m.user_id,
                                  patch: { status: 'suspended' },
                                })
                              }
                            >
                              {t('settings.members.suspend')}
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() =>
                                update.mutate({
                                  userId: m.user_id,
                                  patch: { status: 'active' },
                                })
                              }
                            >
                              {t('settings.members.restore')}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <p className="text-muted-foreground mt-3 text-xs">
        {t('settings.members.footnote')}
      </p>
    </div>
  )
}
