import { useEffect, useState } from 'react'
import { useT } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useInstructors } from '@/features/instructors/api'
import {
  useAttachInstructor,
  useMakeInstructor,
  type StaffMember,
} from './api'
import { errorMessage } from '@/lib/errors'

/**
 * Give a member an instructor record, so they can be assigned courses and grade
 * them — without touching the access level they already hold. This is what makes
 * "admin *and* instructor" a thing you can do in one click.
 *
 * Two routes, because both are common: create a record from the account's own
 * details, or claim a record the academy keyed in before this person had a login
 * (which keeps that record's course assignments and grading history).
 */
export function MakeInstructorDialog({
  academyId,
  member,
  open,
  onOpenChange,
}: {
  academyId: string | null
  member: StaffMember | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useT()
  const { data: instructors } = useInstructors(academyId)
  const makeInstructor = useMakeInstructor(academyId)
  const attachInstructor = useAttachInstructor(academyId)

  const [attachId, setAttachId] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setAttachId('')
    setError(null)
  }, [open])

  if (!member) return null

  // Only records nobody has claimed: `instructors.user_id` is unique per academy
  // and link_instructor_account refuses a second account.
  const attachable = (instructors ?? []).filter((i) => !i.user_id)
  const busy = makeInstructor.isPending || attachInstructor.isPending
  const name = member.full_name?.trim() || member.email || t('common.unnamed')

  async function run(action: () => Promise<unknown>) {
    setError(null)
    try {
      await action()
      onOpenChange(false)
    } catch (e) {
      setError(errorMessage(e, t('members.instructor.failed')))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('members.instructor.make')}</DialogTitle>
          <DialogDescription>
            {t('members.instructor.dialog_description', { name })}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5">
          <div>
            <Button
              disabled={busy || !member.email}
              onClick={() => void run(() => makeInstructor.mutateAsync(member!))}
            >
              {makeInstructor.isPending
                ? t('members.instructor.making')
                : t('members.instructor.create_new')}
            </Button>
            <p className="text-muted-foreground mt-2 text-xs">
              {member.email
                ? t('members.instructor.made_from_profile')
                : t('members.instructor.needs_email')}
            </p>
          </div>

          {member.email ? (
            <div className="grid gap-2 border-t pt-4">
              <Label>{t('members.instructor.attach_label')}</Label>
              {attachable.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  {t('members.instructor.attach_empty')}
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={attachId} onValueChange={setAttachId}>
                    <SelectTrigger className="min-w-64 flex-1">
                      <SelectValue
                        placeholder={t('members.instructor.attach_placeholder')}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {attachable.map((i) => (
                        <SelectItem key={i.id} value={i.id}>
                          {i.full_name ?? t('common.unnamed')} · {i.instructor_no}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    disabled={!attachId || busy}
                    onClick={() =>
                      void run(() =>
                        attachInstructor.mutateAsync({
                          instructorId: attachId,
                          email: member!.email!,
                        }),
                      )
                    }
                  >
                    {t('members.instructor.attach')}
                  </Button>
                </div>
              )}
            </div>
          ) : null}

          {error ? <p className="text-destructive text-sm">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            {t('common.cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
