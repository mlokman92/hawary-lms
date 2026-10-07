import { useEffect, useState } from 'react'
import { errorMessage } from '@/lib/errors'
import { useT } from '@/lib/i18n'
import { sendRecordInvite } from '@/features/invitations/autoInvite'
import {
  useCreateStudent,
  useUpdateStudent,
  type Gender,
  type Student,
} from '@/features/students/api'
import { Button, DateField, Field, FormError, Input, Select, Sheet } from '@/ui'

/**
 * Add or edit a student record — the web's `StudentFormDialog`, with the same
 * two required fields (name, email) and the same consequence of the second:
 * creating a record invites its address at once, because a record carrying
 * somebody's email IS their invitation (docs/account-claiming.md).
 *
 * The profile picture is left to the web app. Everything else on the record is
 * here.
 */
export function StudentForm({
  academyId,
  student,
  visible,
  onClose,
  onCreated,
}: {
  academyId: string
  /** Present = edit; absent = add. */
  student?: Student | null
  visible: boolean
  onClose: () => void
  onCreated?: (id: string) => void
}) {
  const { t } = useT()
  const create = useCreateStudent(academyId)
  const update = useUpdateStudent(academyId)
  const [fullName, setFullName] = useState('')
  const [gender, setGender] = useState<Gender | null>(null)
  const [ic, setIc] = useState('')
  const [dob, setDob] = useState<string | null>(null)
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [organization, setOrganization] = useState('')
  const [address, setAddress] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Reseed each time the sheet opens, so a cancelled edit leaves nothing behind.
  useEffect(() => {
    if (!visible) return
    setFullName(student?.full_name ?? '')
    setGender(student?.gender ?? null)
    setIc(student?.ic_number ?? '')
    setDob(student?.date_of_birth ?? null)
    setPhone(student?.phone ?? '')
    setEmail(student?.email ?? '')
    setOrganization(student?.organization ?? '')
    setAddress(student?.address ?? '')
    setError(null)
  }, [visible, student])

  const busy = create.isPending || update.isPending

  async function submit() {
    setError(null)
    if (!fullName.trim()) return setError(t('students.form.name_required'))
    if (!email.trim()) return setError(t('students.form.email_required'))
    const values = {
      full_name: fullName.trim(),
      gender,
      ic_number: ic.trim() || null,
      date_of_birth: dob,
      phone: phone.trim() || null,
      email: email.trim() || null,
      organization: organization.trim() || null,
      address: address.trim() || null,
    }
    try {
      if (student) {
        await update.mutateAsync({ id: student.id, patch: values })
      } else {
        const created = await create.mutateAsync(values)
        // Not awaited: the email is a notification, not a grant, and holding
        // the sheet open on a mail provider would be the slowest part of a save.
        void sendRecordInvite('student', created.id)
        onCreated?.(created.id)
      }
      onClose()
    } catch (e) {
      setError(errorMessage(e, t('common.error')))
    }
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={student ? t('students.form.edit_title') : t('students.form.add_title')}
    >
      <Field label={t('common.full_name')}>
        <Input value={fullName} onChangeText={setFullName} autoCapitalize="words" />
      </Field>
      <Field label={t('common.email')}>
        <Input
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
      </Field>
      <Field label={t('common.phone')}>
        <Input value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      </Field>
      <Field label={t('students.field.gender')}>
        <Select<Gender>
          value={gender}
          options={[
            { value: 'male', label: t('students.gender.male') },
            { value: 'female', label: t('students.gender.female') },
          ]}
          onChange={setGender}
          placeholder={t('students.form.select_gender')}
          title={t('students.field.gender')}
        />
      </Field>
      <Field label={t('students.field.ic')}>
        <Input
          value={ic}
          onChangeText={setIc}
          placeholder={t('students.form.ic_placeholder')}
        />
      </Field>
      <Field label={t('students.field.dob')}>
        <DateField value={dob} onChange={setDob} maximumDate={new Date()} />
      </Field>
      <Field label={t('students.field.organization')}>
        <Input
          value={organization}
          onChangeText={setOrganization}
          placeholder={t('students.form.organization_placeholder')}
        />
      </Field>
      <Field label={t('students.field.address')}>
        <Input value={address} onChangeText={setAddress} multiline />
      </Field>
      <FormError error={error} />
      <Button
        title={
          busy
            ? t('common.saving')
            : student
              ? t('students.form.save_changes')
              : t('students.action.add')
        }
        loading={busy}
        onPress={() => void submit()}
      />
    </Sheet>
  )
}
