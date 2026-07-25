import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
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
import { InviteLink } from './InviteLink'
import { useCreateInvitation, useCreateStudent } from './api'

export function InviteStudentDialog({
  academyId,
  open,
  onOpenChange,
}: {
  academyId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const createStudent = useCreateStudent(academyId)
  const createInvitation = useCreateInvitation()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setEmail('')
      setError(null)
      setLink(null)
    }
  }, [open])

  const busy = createStudent.isPending || createInvitation.isPending

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email.trim()) return setError('Email is required.')
    setError(null)
    try {
      const student = await createStudent.mutateAsync({ email: email.trim() })
      const inv = await createInvitation.mutateAsync(student.id)
      setLink(`${window.location.origin}/accept-invite?token=${inv.token}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite student</DialogTitle>
          <DialogDescription>
            {link
              ? 'Student added and invitation created.'
              : 'Add a student by email and generate an invite link.'}
          </DialogDescription>
        </DialogHeader>

        {link ? (
          <InviteLink url={link} />
        ) : (
          <form id="invite-form" className="grid gap-2" onSubmit={onSubmit}>
            <Label htmlFor="invite-email">Email address</Label>
            <Input
              id="invite-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="student@example.com"
            />
            {error ? <p className="text-destructive text-sm">{error}</p> : null}
          </form>
        )}

        <DialogFooter>
          {link ? (
            <Button type="button" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button type="submit" form="invite-form" disabled={busy}>
                {busy ? 'Creating…' : 'Create invite'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
