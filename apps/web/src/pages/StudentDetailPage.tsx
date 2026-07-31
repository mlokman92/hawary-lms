import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Pencil, Plus, Receipt, UserPlus, X } from 'lucide-react'
import { formatMYR, type Enums } from '@hawary/shared'
import { useAcademy } from '@/lib/academy'
import { getLang, useT, type TKey } from '@/lib/i18n'
import { localeFor } from '@/lib/format'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { StudentFormDialog } from '@/features/students/StudentFormDialog'
import { EnrollCourseDialog } from '@/features/students/EnrollCourseDialog'
import { InviteLink } from '@/features/students/InviteLink'
import { LinkAccountDialog } from '@/features/invitations/LinkAccountDialog'
import { MANUAL_STATUSES, STATUS_META } from '@/features/students/status'
import { InvoiceFormDialog } from '@/features/payments/InvoiceFormDialog'
import {
  INVOICE_STATUS_VARIANT,
  invoiceTotals,
  useStudentInvoices,
  type InvoiceStatus,
} from '@/features/payments/api'
import {
  useArchiveStudent,
  useCreateInvitation,
  useStudent,
  useStudentEnrollments,
  useUnenroll,
  useUpdateStudent,
  type StudentStatus,
} from '@/features/students/api'
import { useSendInvitation } from '@/features/students/api'
import {
  MEMBER_STATUS_META,
  useMemberAccess,
  useUpdateMember,
} from '@/features/members/api'

/**
 * Enum→label maps are module constants, built before any language is known, so
 * they hold the translation key and the render site resolves it with `t`.
 */
const ENROLLMENT_LABEL: Record<Enums<'enrollment_status'>, TKey> = {
  active: 'students.enrollment.active',
  pending: 'students.enrollment.pending',
  completed: 'students.enrollment.completed',
  dropped: 'students.enrollment.dropped',
  cancelled: 'students.enrollment.cancelled',
}

const INVOICE_LABEL: Record<InvoiceStatus, TKey> = {
  draft: 'students.invoice.draft',
  issued: 'students.invoice.issued',
  partially_paid: 'students.invoice.partially_paid',
  paid: 'students.invoice.paid',
  overdue: 'students.invoice.overdue',
  void: 'students.invoice.void',
  cancelled: 'students.invoice.cancelled',
}

function initials(name?: string | null, email?: string | null) {
  const src = (name || email || '').trim()
  if (!src) return 'S'
  const parts = src.split(/\s+/).filter(Boolean)
  if (parts.length >= 2)
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase()
  return src.slice(0, 2).toUpperCase()
}

/**
 * Kept local rather than swapped for `lib/format`: the callers need `null` back
 * for a missing date (so the field falls through to its muted em dash) and one
 * of them wants a long month. Only the locale is read from the language now.
 */
function fmtDate(iso: string | null, opts: Intl.DateTimeFormatOptions) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString(
    localeFor(getLang()),
    opts,
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

function Money({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'positive' | 'warning'
}) {
  const c =
    tone === 'positive'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'warning'
        ? 'text-amber-600 dark:text-amber-400'
        : ''
  return (
    <div className="rounded-lg border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={`mt-0.5 text-base font-semibold tabular-nums ${c}`}>{value}</p>
    </div>
  )
}

export function StudentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useT()
  const { activeAcademyId, active } = useAcademy()
  const academyId = activeAcademyId ?? ''
  const isStaff = active?.role === 'admin' || active?.role === 'trainer'

  const isAdmin = active?.role === 'admin'

  const { data: student, isLoading, error } = useStudent(id)
  const { data: enrollments } = useStudentEnrollments(id)
  const updateStudent = useUpdateStudent(academyId)
  const archiveStudent = useArchiveStudent(academyId)
  const unenroll = useUnenroll(academyId, id ?? '')
  const createInvitation = useCreateInvitation()
  const { data: invoices } = useStudentInvoices(academyId, id)
  const { data: access } = useMemberAccess(activeAcademyId, student?.user_id)
  const updateMember = useUpdateMember(activeAcademyId)

  const [editOpen, setEditOpen] = useState(false)
  const [enrollOpen, setEnrollOpen] = useState(false)
  const [invoiceOpen, setInvoiceOpen] = useState(false)
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [linkOpen, setLinkOpen] = useState(false)
  const sendInvitation = useSendInvitation()

  if (isLoading) {
    return (
      <div className="text-muted-foreground py-16 text-center text-sm">
        {t('common.loading')}
      </div>
    )
  }
  if (error || !student) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <p className="text-muted-foreground text-sm">{t('students.not_found')}</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/students">{t('students.back_to_list')}</Link>
        </Button>
      </div>
    )
  }

  const totals = invoiceTotals(invoices ?? [])

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/students">
          <ArrowLeft /> {t('common.students')}
        </Link>
      </Button>

      {/* 1. Header */}
      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <Avatar className="size-16">
              <AvatarImage src={student.avatar_url ?? undefined} />
              <AvatarFallback className="text-lg">
                {initials(student.full_name, student.email)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <h1 className="text-xl font-semibold tracking-tight">
                {student.full_name ?? t('students.unnamed')}
              </h1>
              <p className="text-muted-foreground text-sm">
                {t('students.member_since', {
                  date:
                    fmtDate(student.created_at, {
                      month: 'long',
                      year: 'numeric',
                    }) ?? '—',
                  no: student.student_no,
                })}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {student.user_id ? (
                  <>
                    <Badge variant="secondary">
                      {t('students.account.linked')}
                    </Badge>
                    {/* App access lives here now: students are no longer listed
                        on /members, and suspending a membership is what
                        actually revokes course access (app.is_enrolled requires
                        an active member row). */}
                    {access ? (
                      <Badge variant={MEMBER_STATUS_META[access.status].variant}>
                        {t(MEMBER_STATUS_META[access.status].labelKey)}
                      </Badge>
                    ) : null}
                    {isAdmin && access ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={updateMember.isPending}
                        onClick={() =>
                          updateMember.mutate({
                            userId: student.user_id!,
                            patch: {
                              status:
                                access.status === 'active'
                                  ? 'suspended'
                                  : 'active',
                            },
                          })
                        }
                      >
                        {access.status === 'active'
                          ? t('members.suspend')
                          : t('members.restore')}
                      </Button>
                    ) : null}
                  </>
                ) : student.email ? (
                  isStaff ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={createInvitation.isPending}
                      onClick={async () => {
                        try {
                          const inv = await createInvitation.mutateAsync(
                            student.id,
                          )
                          setInviteLink(
                            `${window.location.origin}/accept-invite?token=${inv.token}`,
                          )
                          // Minting a token is not an invitation until
                          // it is delivered; email is best-effort and the
                          // copyable link is the fallback.
                          try {
                            await sendInvitation.mutateAsync(inv.token)
                          } catch {
                            /* link fallback below */
                          }
                        } catch {
                          /* surfaced via createInvitation.error below */
                        }
                      }}
                    >
                      <UserPlus />
                      {createInvitation.isPending
                        ? t('common.creating')
                        : t('students.account.invite_to_app')}
                    </Button>
                  ) : null
                ) : null}
                {isStaff && !student.user_id ? (
                  <Button size="sm" variant="ghost" onClick={() => setLinkOpen(true)}>
                    {t('students.account.link_existing')}
                  </Button>
                ) : null}
                {isStaff && !student.user_id && !student.email ? (
                  <span className="text-muted-foreground text-xs">
                    {t('students.account.needs_email')}
                  </span>
                ) : null}
              </div>
            </div>
            {isStaff ? (
              <div className="flex items-center gap-2">
                <Select
                  value={student.status}
                  onValueChange={(v) =>
                    updateStudent.mutate({
                      id: student.id,
                      patch: { status: v as StudentStatus },
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
                  <Pencil /> {t('students.action.edit_profile')}
                </Button>
              </div>
            ) : (
              <Badge variant={STATUS_META[student.status].variant}>
                {t(STATUS_META[student.status].labelKey)}
              </Badge>
            )}
          </div>
          {createInvitation.error ? (
            <p className="text-destructive text-sm">
              {createInvitation.error.message}
            </p>
          ) : null}
      {activeAcademyId ? (
        <LinkAccountDialog
          academyId={activeAcademyId}
          recordId={student.id}
          kind="student"
          defaultEmail={student.email}
          open={linkOpen}
          onOpenChange={setLinkOpen}
        />
      ) : null}
          {inviteLink ? <InviteLink url={inviteLink} /> : null}
        </CardContent>
      </Card>

      {/* 2. Personal details */}
      <Card>
        <CardHeader>
          <CardTitle>{t('students.personal.title')}</CardTitle>
          <CardDescription>
            {t('students.personal.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t('students.field.student_no')}
              value={student.student_no}
            />
            <Field label={t('students.field.ic')} value={student.ic_number} />
            <Field
              label={t('students.field.gender')}
              value={
                student.gender ? (
                  <span className="capitalize">
                    {t(
                      student.gender === 'male'
                        ? 'students.gender.male'
                        : 'students.gender.female',
                    )}
                  </span>
                ) : null
              }
            />
            <Field
              label={t('students.field.dob')}
              value={fmtDate(student.date_of_birth, {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            />
            <Field label={t('common.phone')} value={student.phone} />
            <Field label={t('common.email')} value={student.email} />
            <Field
              label={t('students.field.organization')}
              value={student.organization}
              className="sm:col-span-2"
            />
            <Field
              label={t('students.field.address')}
              value={student.address}
              className="sm:col-span-2"
            />
          </dl>
        </CardContent>
      </Card>

      {/* 3. Enrolled courses */}
      <Card>
        <CardHeader>
          <CardTitle>{t('students.enrolled.title')}</CardTitle>
          {isStaff ? (
            <CardAction>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEnrollOpen(true)}
              >
                <Plus /> {t('students.enrolled.add')}
              </Button>
            </CardAction>
          ) : null}
        </CardHeader>
        <CardContent>
          {!enrollments || enrollments.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t('students.enrolled.empty')}
            </p>
          ) : (
            <ul className="divide-y">
              {enrollments.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div>
                    <div className="text-sm font-medium">
                      {e.courses?.title ?? t('common.course')}
                    </div>
                    <div className="text-muted-foreground text-xs capitalize">
                      {t(ENROLLMENT_LABEL[e.status])}
                    </div>
                  </div>
                  {isStaff ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => unenroll.mutate(e.id)}
                      aria-label={t('students.enrolled.remove')}
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

      {/* 4. Billing */}
      <Card>
        <CardHeader>
          <CardTitle>{t('students.billing.title')}</CardTitle>
          <CardDescription>{t('students.billing.description')}</CardDescription>
          {isStaff ? (
            <CardAction>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setInvoiceOpen(true)}
              >
                <Plus /> {t('students.billing.new_invoice')}
              </Button>
            </CardAction>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Money
              label={t('students.billing.billed')}
              value={formatMYR(totals.billed)}
            />
            <Money
              label={t('students.billing.paid')}
              value={formatMYR(totals.paid)}
              tone="positive"
            />
            <Money
              label={t('students.billing.outstanding')}
              value={formatMYR(totals.outstanding)}
              tone={totals.outstanding > 0 ? 'warning' : undefined}
            />
          </div>

          {!invoices || invoices.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t('students.billing.empty')}
            </p>
          ) : (
            <ul className="divide-y">
              {invoices.map((inv) => (
                <li key={inv.id}>
                  <Link
                    to={`/payments/${inv.id}`}
                    className="hover:bg-accent -mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Receipt className="text-muted-foreground size-3.5 shrink-0" />
                        {inv.invoice_no}
                        <Badge
                          variant={INVOICE_STATUS_VARIANT[inv.status]}
                          className="capitalize"
                        >
                          {t(INVOICE_LABEL[inv.status])}
                        </Badge>
                      </div>
                      <div className="text-muted-foreground mt-0.5 text-xs">
                        {fmtDate(inv.issued_at ?? inv.created_at, {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                        {inv.course ? ` · ${inv.course.title}` : ''}
                        {inv.due_at
                          ? ` · ${t('students.billing.due_on', {
                              date:
                                fmtDate(inv.due_at, {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric',
                                }) ?? '—',
                            })}`
                          : ''}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium tabular-nums">
                        {formatMYR(inv.total_sen)}
                      </div>
                      {inv.amount_paid_sen > 0 &&
                      inv.amount_paid_sen < inv.total_sen ? (
                        <div className="text-muted-foreground text-xs tabular-nums">
                          {t('students.billing.amount_paid', {
                            amount: formatMYR(inv.amount_paid_sen),
                          })}
                        </div>
                      ) : null}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* 5. Danger zone */}
      {isStaff ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-destructive">
              {t('students.danger.title')}
            </CardTitle>
            <CardDescription>{t('students.danger.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">
                  {t('students.danger.action')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t('students.danger.confirm_title')}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('students.danger.confirm_body', {
                      name:
                        student.full_name ?? t('students.danger.this_student'),
                    })}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={async () => {
                      await archiveStudent.mutateAsync(student.id)
                      navigate('/students')
                    }}
                  >
                    {t('students.danger.confirm')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      ) : null}

      <StudentFormDialog
        academyId={academyId}
        student={student}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <EnrollCourseDialog
        academyId={academyId}
        studentId={student.id}
        enrolledCourseIds={(enrollments ?? []).map((e) => e.course_id)}
        open={enrollOpen}
        onOpenChange={setEnrollOpen}
      />
      {isStaff ? (
        <InvoiceFormDialog
          academyId={academyId}
          initialStudentId={student.id}
          open={invoiceOpen}
          onOpenChange={setInvoiceOpen}
          onCreated={(invId) => navigate(`/payments/${invId}`)}
        />
      ) : null}
    </div>
  )
}
