import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { GraduationCap, MoreHorizontal } from 'lucide-react'
import { useAcademy } from '@/lib/academy'
import { useAuth } from '@/lib/auth'
import { fmtMonthYear, initialsOf } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { PageHeader } from '@/components/patterns/PageHeader'
import { EmptyState } from '@/components/patterns/EmptyState'
import { ErrorBlock, LoadingBlock } from '@/components/patterns/QueryState'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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
import { MakeInstructorDialog } from '@/features/members/MakeInstructorDialog'
import {
  MEMBER_STATUS_META,
  TIER_META,
  memberRecordPath,
  memberTier,
  useStaffMembers,
  useUnlinkInstructor,
  useUpdateMember,
  type StaffMember,
} from '@/features/members/api'

/**
 * Admin-only membership management.
 *
 * Two things this page is not:
 *   - it is not the student roster. A student is an academy record with its own
 *     page; listing every enrolled learner here buried the handful of people
 *     who can actually sign in to the back office. `list_academy_staff` filters
 *     them out server-side, and student access is managed from the student's
 *     own page.
 *   - it is not a single ladder. `role` is the access level the database
 *     enforces; whether someone also teaches is a separate, linked instructor
 *     record. Both are shown, and one person can hold both.
 *
 * accept_invitation's role ladder only ever escalates (admin > trainer, never
 * down), so without the controls here a student later invited as an instructor
 * is a trainer forever. This is also the only way to suspend staff access.
 */
export function MembersPage() {
  const { activeAcademyId, active } = useAcademy()
  const { user } = useAuth()
  const { t, tn } = useT()
  const navigate = useNavigate()
  const { data: members, isLoading, error } = useStaffMembers(activeAcademyId)
  const update = useUpdateMember(activeAcademyId)
  const unlinkInstructor = useUnlinkInstructor(activeAcademyId)
  const [makeInstructorFor, setMakeInstructorFor] = useState<StaffMember | null>(
    null,
  )

  if (active && active.role !== 'admin') return <Navigate to="/" replace />

  const rows = members ?? []
  const admins = rows.filter(
    (m) => m.role === 'admin' && m.status === 'active',
  ).length

  // Never let the last active admin demote or suspend themselves out of the
  // academy — that state needs database access to undo.
  const isLastAdmin = (m: StaffMember) =>
    m.role === 'admin' && m.status === 'active' && admins <= 1

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title={t('members.title')}
        description={t('members.subtitle')}
      />

      <div className="mt-6">
        {isLoading ? (
          <LoadingBlock />
        ) : error ? (
          <ErrorBlock error={error} />
        ) : rows.length === 0 ? (
          <EmptyState title={t('members.empty')} />
        ) : (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('members.col.person')}</TableHead>
                  <TableHead>{t('members.col.access')}</TableHead>
                  <TableHead>{t('members.col.contact')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((m) => {
                  const isSelf = m.user_id === user?.id
                  const tier = memberTier(m)
                  const lastAdmin = isLastAdmin(m)
                  // The row opens the person's own record — their instructor or
                  // student profile. A member with neither has nothing to open;
                  // "Make instructor" in the menu is what gives them one.
                  const recordPath = memberRecordPath(m)
                  return (
                    <TableRow
                      key={m.user_id}
                      className={recordPath ? 'cursor-pointer' : undefined}
                      onClick={
                        recordPath ? () => navigate(recordPath) : undefined
                      }
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="size-8">
                            <AvatarImage src={m.avatar_url ?? undefined} />
                            <AvatarFallback className="text-xs">
                              {initialsOf(m.full_name, m.email)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="font-medium">
                              {m.full_name?.trim() || t('common.unnamed')}
                              {isSelf ? (
                                <span className="text-muted-foreground font-normal">
                                  {' '}
                                  {t('members.you')}
                                </span>
                              ) : null}
                            </div>
                            <div className="text-muted-foreground text-xs">
                              {t('members.member_since', {
                                date: fmtMonthYear(m.joined_at),
                              })}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {/* Access and teaching side by side: the pair is the
                            whole answer to "what is this person here". */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant={TIER_META[tier].variant}>
                            {t(TIER_META[tier].labelKey)}
                          </Badge>
                          {m.instructor_id ? (
                            <Badge variant="outline" className="gap-1">
                              <GraduationCap className="size-3" />
                              {t('members.instructor')}
                            </Badge>
                          ) : null}
                        </div>
                        {m.instructor_id && m.courses_taught > 0 ? (
                          <div className="text-muted-foreground mt-1 text-xs">
                            {tn('members.instructor.courses', m.courses_taught)}
                          </div>
                        ) : !recordPath ? (
                          <div className="text-muted-foreground mt-1 text-xs">
                            {t('members.no_record')}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {m.email ?? (
                            <span className="text-muted-foreground">
                              {t('members.no_email')}
                            </span>
                          )}
                        </div>
                        {m.phone ? (
                          <div className="text-muted-foreground text-xs">
                            {m.phone}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant={MEMBER_STATUS_META[m.status].variant}>
                          {t(MEMBER_STATUS_META[m.status].labelKey)}
                        </Badge>
                      </TableCell>
                      {/* The menu lives inside a clickable row, so every stray
                          click here has to stop before it navigates. */}
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm">
                              <MoreHorizontal />
                              <span className="sr-only">
                                {t('members.actions')}
                              </span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              disabled={m.role === 'admin'}
                              onClick={() =>
                                update.mutate({
                                  userId: m.user_id,
                                  patch: { role: 'admin' },
                                })
                              }
                            >
                              {t('members.make_admin')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={m.role === 'trainer' || lastAdmin}
                              onClick={() =>
                                update.mutate({
                                  userId: m.user_id,
                                  patch: { role: 'trainer' },
                                })
                              }
                            >
                              {t('members.make_trainer')}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {/* The teaching axis. Detaching keeps the record —
                                it only stops being this account's. */}
                            {m.instructor_id ? (
                              <DropdownMenuItem
                                onClick={() =>
                                  unlinkInstructor.mutate(m.instructor_id!)
                                }
                              >
                                {t('members.instructor.detach')}
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onClick={() => setMakeInstructorFor(m)}
                              >
                                {t('members.instructor.make')}
                              </DropdownMenuItem>
                            )}
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
                                {t('members.suspend')}
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
                                {t('members.restore')}
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
          </div>
        )}
      </div>

      {update.error || unlinkInstructor.error ? (
        <p className="text-destructive mt-3 text-sm">
          {update.error?.message ||
            unlinkInstructor.error?.message ||
            t('members.access.failed')}
        </p>
      ) : null}

      <MakeInstructorDialog
        academyId={activeAcademyId}
        member={makeInstructorFor}
        open={!!makeInstructorFor}
        onOpenChange={(open) => {
          if (!open) setMakeInstructorFor(null)
        }}
      />

      <p className="text-muted-foreground mt-3 text-xs">
        {t('members.footnote')}
      </p>
    </div>
  )
}
