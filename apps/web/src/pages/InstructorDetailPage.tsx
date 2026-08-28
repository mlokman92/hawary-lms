import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Pencil, Plus, X } from 'lucide-react'
import { useAcademy } from '@/lib/academy'
import { fmtDate, localeFor } from '@/lib/format'
import { getLang, useT, type TKey } from '@/lib/i18n'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { LinkAccountDialog } from '@/features/invitations/LinkAccountDialog'
import { InstructorFormDialog } from '@/features/instructors/InstructorFormDialog'
import { AssignCourseDialog } from '@/features/instructors/AssignCourseDialog'
import { MANUAL_STATUSES, STATUS_META } from '@/features/instructors/status'
import {
  useArchiveInstructor,
  useInstructor,
  useInstructorCourses,
  useUnassignCourse,
  useUpdateInstructor,
  type InstructorStatus,
} from '@/features/instructors/api'
import { useStaffMembers, useUpdateMember } from '@/features/members/api'
import type { Enums } from '@hawary/shared'

/** The status of a course this instructor teaches, shown under its title. */
const COURSE_STATUS_KEY: Record<Enums<'course_status'>, TKey> = {
  draft: 'common.draft',
  published: 'common.published',
  archived: 'instructors.course_status.archived',
}

function initials(name?: string | null, email?: string | null) {
  const src = (name || email || '').trim()
  if (!src) return 'I'
  const parts = src.split(/\s+/).filter(Boolean)
  if (parts.length >= 2)
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase()
  return src.slice(0, 2).toUpperCase()
}

/**
 * "Member since March 2026" wants the long month, which `lib/format` does not
 * offer — the locale is still read at render time so a language switch takes
 * effect the same way it does there.
 */
function fmtLongMonthYear(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString(
    localeFor(getLang()),
    { month: 'long', year: 'numeric' },
  )
}

function Field({
  label,
  value,
  className,
}: {
  label: string
  value: ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-0.5 text-sm">
        {value || <span className="text-muted-foreground">—</span>}
      </dd>
    </div>
  )
}

export function InstructorDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useT()
  const { activeAcademyId, active } = useAcademy()
  const academyId = activeAcademyId ?? ''
  const isStaff = active?.role === 'admin' || active?.role === 'trainer'
  const isAdmin = active?.role === 'admin'

  const { data: instructor, isLoading, error } = useInstructor(id)
  // Admin-only RPC, so it is only ever requested for an admin — passing null
  // leaves the query disabled for a trainer rather than failing it.
  const { data: staff } = useStaffMembers(isAdmin ? activeAcademyId : null)
  const updateMember = useUpdateMember(activeAcademyId)
  const { data: assignments } = useInstructorCourses(id)
  const updateInstructor = useUpdateInstructor(academyId)
  const archiveInstructor = useArchiveInstructor(academyId)
  const unassign = useUnassignCourse(academyId, id ?? '')

  const [editOpen, setEditOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)

  if (isLoading) {
    return (
      <div className="text-muted-foreground py-16 text-center text-sm">
        {t('common.loading')}
      </div>
    )
  }
  if (error || !instructor) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <p className="text-muted-foreground text-sm">
          {t('instructors.not_found')}
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/instructors">{t('instructors.back_to_list')}</Link>
        </Button>
      </div>
    )
  }

  // The membership behind this record, when it has an account at all.
  const member = instructor.user_id
    ? (staff ?? []).find((m) => m.user_id === instructor.user_id)
    : undefined
  // Never let the last active admin demote or suspend themselves out of the
  // academy — that state needs database access to undo.
  const lastAdmin =
    !!member &&
    member.role === 'admin' &&
    member.status === 'active' &&
    (staff ?? []).filter((m) => m.role === 'admin' && m.status === 'active')
      .length <= 1

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/instructors">
          <ArrowLeft /> {t('common.instructors')}
        </Link>
      </Button>

      {/* 1. Header */}
      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <Avatar className="size-16">
              <AvatarImage src={instructor.avatar_url ?? undefined} />
              <AvatarFallback className="text-lg">
                {initials(instructor.full_name, instructor.email)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <h1 className="text-xl font-semibold tracking-tight">
                {instructor.full_name ?? t('instructors.unnamed')}
              </h1>
              <p className="text-muted-foreground text-sm">
                {t('instructors.member_since', {
                  date: fmtLongMonthYear(instructor.created_at) ?? '—',
                  no: instructor.instructor_no,
                })}
              </p>
              <div className="mt-2 flex items-center gap-2">
                {instructor.user_id ? (
                  <>
                    <Badge variant="secondary">
                      {t('instructors.account_linked')}
                    </Badge>
                    {/* The one access control worth having here: everything
                        else about a membership (suspending, detaching the
                        record) lives on /members. */}
                    {isAdmin && member ? (
                      <Label className="flex items-center gap-2 font-normal">
                        <Checkbox
                          checked={member.role === 'admin'}
                          disabled={lastAdmin || updateMember.isPending}
                          onCheckedChange={(v) =>
                            updateMember.mutate({
                              userId: member.user_id,
                              patch: { role: v === true ? 'admin' : 'trainer' },
                            })
                          }
                        />
                        {t('members.make_admin')}
                      </Label>
                    ) : null}
                  </>
                ) : null}
                {isStaff && !instructor.user_id ? (
                  <Button size="sm" variant="ghost" onClick={() => setLinkOpen(true)}>
                    {t('instructors.link_account')}
                  </Button>
                ) : null}
              </div>
            </div>
            {isStaff ? (
              <div className="flex items-center gap-2">
                <Select
                  value={instructor.status}
                  onValueChange={(v) =>
                    updateInstructor.mutate({
                      id: instructor.id,
                      patch: { status: v as InstructorStatus },
                    })
                  }
                >
                  <SelectTrigger size="sm" className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MANUAL_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {t(STATUS_META[s].labelKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={() => setEditOpen(true)}>
                  <Pencil /> {t('instructors.edit_profile')}
                </Button>
              </div>
            ) : (
              <Badge variant={STATUS_META[instructor.status].variant}>
                {t(STATUS_META[instructor.status].labelKey)}
              </Badge>
            )}
          </div>
          {lastAdmin ? (
            <p className="text-muted-foreground text-xs">
              {t('members.last_admin')}
            </p>
          ) : null}
          {updateMember.error ? (
            <p className="text-destructive text-sm">
              {updateMember.error.message ?? t('members.access.failed')}
            </p>
          ) : null}
      {activeAcademyId ? (
        <LinkAccountDialog
          academyId={activeAcademyId}
          recordId={instructor.id}
          kind="instructor"
          defaultEmail={instructor.email}
          open={linkOpen}
          onOpenChange={setLinkOpen}
        />
      ) : null}
        </CardContent>
      </Card>

      {/* 2. Personal details */}
      <Card>
        <CardHeader>
          <CardTitle>{t('instructors.personal.title')}</CardTitle>
          <CardDescription>
            {t('instructors.personal.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t('instructors.field.id')}
              value={instructor.instructor_no}
            />
            <Field
              label={t('instructors.field.specialization')}
              value={instructor.specialization}
            />
            <Field
              label={t('instructors.field.ic')}
              value={instructor.ic_number}
            />
            <Field
              label={t('instructors.field.gender')}
              value={
                instructor.gender ? (
                  <span className="capitalize">
                    {t(
                      instructor.gender === 'male'
                        ? 'instructors.gender.male'
                        : 'instructors.gender.female',
                    )}
                  </span>
                ) : null
              }
            />
            <Field
              label={t('instructors.field.dob')}
              value={
                instructor.date_of_birth
                  ? fmtDate(instructor.date_of_birth)
                  : null
              }
            />
            <Field label={t('common.phone')} value={instructor.phone} />
            <Field label={t('common.email')} value={instructor.email} />
            <Field
              label={t('instructors.field.bio')}
              value={instructor.bio}
              className="sm:col-span-2"
            />
            <Field
              label={t('instructors.field.address')}
              value={instructor.address}
              className="sm:col-span-2"
            />
          </dl>
        </CardContent>
      </Card>

      {/* 3. Assigned courses */}
      <Card>
        <CardHeader>
          <CardTitle>{t('instructors.courses.title')}</CardTitle>
          {isStaff ? (
            <CardAction>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setAssignOpen(true)}
              >
                <Plus /> {t('instructors.courses.assign')}
              </Button>
            </CardAction>
          ) : null}
        </CardHeader>
        <CardContent>
          {!assignments || assignments.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t('instructors.courses.empty')}
            </p>
          ) : (
            <ul className="divide-y">
              {assignments.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div>
                    <div className="text-sm font-medium">
                      {a.courses?.title ?? t('common.course')}
                    </div>
                    <div className="text-muted-foreground text-xs capitalize">
                      {a.courses ? t(COURSE_STATUS_KEY[a.courses.status]) : ''}
                    </div>
                  </div>
                  {isStaff ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => unassign.mutate(a.id)}
                      aria-label={t('instructors.courses.remove')}
                    >
                      <X />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* 4. Danger zone */}
      {isStaff ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-destructive">
              {t('instructors.danger.title')}
            </CardTitle>
            <CardDescription>
              {t('instructors.danger.description')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">
                  {t('instructors.danger.archive')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t('instructors.danger.confirm_title')}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('instructors.danger.confirm_body', {
                      name:
                        instructor.full_name ?? t('instructors.this_instructor'),
                    })}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={async () => {
                      await archiveInstructor.mutateAsync(instructor.id)
                      navigate('/instructors')
                    }}
                  >
                    {t('instructors.danger.confirm_action')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      ) : null}

      <InstructorFormDialog
        academyId={academyId}
        instructor={instructor}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <AssignCourseDialog
        academyId={academyId}
        instructorId={instructor.id}
        assignedCourseIds={(assignments ?? []).map((a) => a.course_id)}
        open={assignOpen}
        onOpenChange={setAssignOpen}
      />
    </div>
  )
}
