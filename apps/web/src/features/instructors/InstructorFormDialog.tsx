import { useEffect, useState, type FormEvent } from 'react'
import { useAcademy } from '@/lib/academy'
import { useAuth } from '@/lib/auth'
import { useT } from '@/lib/i18n'
import { sendRecordInvite } from '@/features/invitations/autoInvite'
import { Button } from '@/components/ui/button'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AvatarUploader } from '@/features/students/AvatarUploader'
import {
  useCreateInstructor,
  useUpdateInstructor,
  type Gender,
  type Instructor,
} from './api'
import { errorMessage } from '@/lib/errors'

export function InstructorFormDialog({
  academyId,
  instructor,
  open,
  onOpenChange,
}: {
  academyId: string
  instructor?: Instructor | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const isEdit = !!instructor
  const { t } = useT()
  const { user } = useAuth()
  const { active } = useAcademy()
  const isAdmin = active?.role === 'admin'
  const createInstructor = useCreateInstructor(academyId)
  const updateInstructor = useUpdateInstructor(academyId)

  const [fullName, setFullName] = useState('')
  const [gender, setGender] = useState<Gender | ''>('')
  const [icNumber, setIcNumber] = useState('')
  const [dob, setDob] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [specialization, setSpecialization] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [bio, setBio] = useState('')
  const [address, setAddress] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setFullName(instructor?.full_name ?? '')
    setGender(instructor?.gender ?? '')
    setIcNumber(instructor?.ic_number ?? '')
    setDob(instructor?.date_of_birth ?? '')
    setPhone(instructor?.phone ?? '')
    setEmail(instructor?.email ?? '')
    setSpecialization(instructor?.specialization ?? '')
    setAvatarUrl(instructor?.avatar_url ?? '')
    setBio(instructor?.bio ?? '')
    setAddress(instructor?.address ?? '')
    setError(null)
  }, [open, instructor])

  const busy = createInstructor.isPending || updateInstructor.isPending

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!fullName.trim()) return setError(t('instructors.form.name_required'))
    if (!gender) return setError(t('instructors.form.gender_required'))
    setError(null)

    const fields = {
      full_name: fullName.trim(),
      gender,
      ic_number: icNumber.trim() || null,
      date_of_birth: dob || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      specialization: specialization.trim() || null,
      avatar_url: avatarUrl.trim() || null,
      bio: bio.trim() || null,
      address: address.trim() || null,
    }
    try {
      if (isEdit && instructor) {
        await updateInstructor.mutateAsync({ id: instructor.id, patch: fields })
      } else {
        const created = await createInstructor.mutateAsync({
          ...fields,
          created_by: user?.id ?? null,
        })
        // Adding an instructor invites them — when there is anybody to invite
        // and the caller may do it. Email is optional on this form, and
        // `create_instructor_invitation` is admin-only on purpose: a trainer
        // who could mint one could invite an address they control and make
        // themselves a second trainer. Skipping is the correct refusal, and it
        // costs nothing, because an instructor record carrying a confirmed
        // email is claimable without a token anyway.
        if (isAdmin && fields.email) void sendRecordInvite('instructor', created.id)
      }
      onOpenChange(false)
    } catch (err) {
      setError(errorMessage(err, t('common.error')))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('instructors.form.edit_title') : t('instructors.add')}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? t('instructors.form.edit_description')
              : t('instructors.form.add_description')}
          </DialogDescription>
        </DialogHeader>

        <form id="instructor-form" className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="full_name">{t('common.name')}</Label>
            <Input
              id="full_name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={t('common.full_name')}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>{t('instructors.field.gender')}</Label>
              <Select
                value={gender}
                onValueChange={(v) => setGender(v as Gender)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={t('instructors.form.gender_placeholder')}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">
                    {t('instructors.gender.male')}
                  </SelectItem>
                  <SelectItem value="female">
                    {t('instructors.gender.female')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ic">{t('instructors.field.ic')}</Label>
              <Input
                id="ic"
                value={icNumber}
                onChange={(e) => setIcNumber(e.target.value)}
                placeholder={t('instructors.form.ic_placeholder')}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="specialization">
              {t('instructors.field.specialization')}
            </Label>
            <Input
              id="specialization"
              value={specialization}
              onChange={(e) => setSpecialization(e.target.value)}
              placeholder={t('instructors.form.specialization_placeholder')}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="dob">{t('instructors.field.dob')}</Label>
              <Input
                id="dob"
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phone">
                {t('instructors.field.phone_number')}
              </Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="email">{t('common.email')}</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <Accordion type="single" collapsible className="border-t">
            <AccordionItem value="more" className="border-b-0">
              <AccordionTrigger className="text-sm">
                {t('instructors.form.more')}
              </AccordionTrigger>
              <AccordionContent className="grid gap-4">
                <div className="grid gap-2">
                  <Label>{t('instructors.form.avatar')}</Label>
                  <AvatarUploader
                    academyId={academyId}
                    value={avatarUrl}
                    onChange={setAvatarUrl}
                    fallback={fullName.trim().slice(0, 2).toUpperCase() || '—'}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="bio">{t('instructors.field.bio')}</Label>
                  <Textarea
                    id="bio"
                    rows={3}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder={t('instructors.form.bio_placeholder')}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="address">
                    {t('instructors.field.address')}
                  </Label>
                  <Textarea
                    id="address"
                    rows={3}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          {error ? <p className="text-destructive text-sm">{error}</p> : null}
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="instructor-form" disabled={busy}>
            {busy
              ? t('common.saving')
              : isEdit
                ? t('instructors.form.save_changes')
                : t('instructors.add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
