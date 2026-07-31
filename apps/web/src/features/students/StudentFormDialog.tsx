import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '@/lib/auth'
import { useT } from '@/lib/i18n'
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
import { AvatarUploader } from './AvatarUploader'
import {
  useCreateStudent,
  useUpdateStudent,
  type Gender,
  type Student,
} from './api'

export function StudentFormDialog({
  academyId,
  student,
  open,
  onOpenChange,
}: {
  academyId: string
  student?: Student | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const isEdit = !!student
  const { t } = useT()
  const { user } = useAuth()
  const createStudent = useCreateStudent(academyId)
  const updateStudent = useUpdateStudent(academyId)

  const [fullName, setFullName] = useState('')
  const [gender, setGender] = useState<Gender | ''>('')
  const [icNumber, setIcNumber] = useState('')
  const [dob, setDob] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [organization, setOrganization] = useState('')
  const [address, setAddress] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setFullName(student?.full_name ?? '')
    setGender(student?.gender ?? '')
    setIcNumber(student?.ic_number ?? '')
    setDob(student?.date_of_birth ?? '')
    setPhone(student?.phone ?? '')
    setEmail(student?.email ?? '')
    setAvatarUrl(student?.avatar_url ?? '')
    setOrganization(student?.organization ?? '')
    setAddress(student?.address ?? '')
    setError(null)
  }, [open, student])

  const busy = createStudent.isPending || updateStudent.isPending

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!fullName.trim()) return setError(t('students.form.name_required'))
    if (!gender) return setError(t('students.form.gender_required'))
    setError(null)

    const fields = {
      full_name: fullName.trim(),
      gender,
      ic_number: icNumber.trim() || null,
      date_of_birth: dob || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      avatar_url: avatarUrl.trim() || null,
      organization: organization.trim() || null,
      address: address.trim() || null,
    }
    try {
      if (isEdit && student) {
        await updateStudent.mutateAsync({ id: student.id, patch: fields })
      } else {
        await createStudent.mutateAsync({ ...fields, created_by: user?.id ?? null })
      }
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Capped at the viewport with the form as the only scroller: the
          "more details" accordion and a tall address field must not push the
          footer buttons off a laptop screen. */}
      <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-lg">
        <DialogHeader className="shrink-0">
          <DialogTitle>
            {isEdit ? t('students.form.edit_title') : t('students.form.add_title')}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? t('students.form.edit_description')
              : t('students.form.add_description')}
          </DialogDescription>
        </DialogHeader>

        {/* -mx-1 px-1 so a focus ring at the edge is not clipped by the scroller. */}
        <form
          id="student-form"
          className="-mx-1 grid min-h-0 flex-1 auto-rows-min gap-4 overflow-y-auto px-1"
          onSubmit={onSubmit}
        >
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
              <Label>{t('students.field.gender')}</Label>
              <Select
                value={gender}
                onValueChange={(v) => setGender(v as Gender)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('students.form.select_gender')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">
                    {t('students.gender.male')}
                  </SelectItem>
                  <SelectItem value="female">
                    {t('students.gender.female')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ic">{t('students.field.ic')}</Label>
              <Input
                id="ic"
                value={icNumber}
                onChange={(e) => setIcNumber(e.target.value)}
                placeholder={t('students.form.ic_placeholder')}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="dob">{t('students.field.dob')}</Label>
              <Input
                id="dob"
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phone">{t('students.field.phone_number')}</Label>
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
                {t('students.form.more_details')}
              </AccordionTrigger>
              <AccordionContent className="grid gap-4">
                <div className="grid gap-2">
                  <Label>{t('students.form.profile_picture')}</Label>
                  <AvatarUploader
                    academyId={academyId}
                    value={avatarUrl}
                    onChange={setAvatarUrl}
                    fallback={fullName.trim().slice(0, 2).toUpperCase() || '—'}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="organization">
                    {t('students.field.organization')}
                  </Label>
                  <Input
                    id="organization"
                    value={organization}
                    onChange={(e) => setOrganization(e.target.value)}
                    placeholder={t('students.form.organization_placeholder')}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="address">{t('students.field.address')}</Label>
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
        </form>

        {/* Outside the scroller: a validation message is worthless if it can be
            scrolled out of sight. */}
        {error ? (
          <p className="text-destructive shrink-0 text-sm">{error}</p>
        ) : null}

        <DialogFooter className="shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="student-form" disabled={busy}>
            {busy
              ? t('common.saving')
              : isEdit
                ? t('students.form.save_changes')
                : t('students.form.add_title')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
