import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '@/lib/auth'
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
    setAddress(student?.address ?? '')
    setError(null)
  }, [open, student])

  const busy = createStudent.isPending || updateStudent.isPending

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!fullName.trim()) return setError('Name is required.')
    if (!gender) return setError('Gender is required.')
    setError(null)

    const fields = {
      full_name: fullName.trim(),
      gender,
      ic_number: icNumber.trim() || null,
      date_of_birth: dob || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      avatar_url: avatarUrl.trim() || null,
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
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit student' : 'Add student'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update this student’s details.'
              : 'Add a student record. Only name and gender are required — a student ID is generated automatically.'}
          </DialogDescription>
        </DialogHeader>

        <form id="student-form" className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="full_name">Name</Label>
            <Input
              id="full_name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Full name"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Gender</Label>
              <Select
                value={gender}
                onValueChange={(v) => setGender(v as Gender)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ic">IC Number</Label>
              <Input
                id="ic"
                value={icNumber}
                onChange={(e) => setIcNumber(e.target.value)}
                placeholder="e.g. 010203-14-5678"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="dob">Date of birth</Label>
              <Input
                id="dob"
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phone">Phone number</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
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
                Add more details
              </AccordionTrigger>
              <AccordionContent className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="avatar">Profile picture URL</Label>
                  <Input
                    id="avatar"
                    type="url"
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    placeholder="https://…"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="address">Address</Label>
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
            Cancel
          </Button>
          <Button type="submit" form="student-form" disabled={busy}>
            {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Add student'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
