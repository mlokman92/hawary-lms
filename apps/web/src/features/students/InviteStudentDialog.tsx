import { useState, type FormEvent } from 'react'
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
import { useCreateStudent } from './api'

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
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email.trim()) return setError('Email is required.')
    setError(null)
    try {
      await createStudent.mutateAsync({ email: email.trim() })
      setEmail('')
      onOpenChange(false)
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
            Add a student by email address. You can fill in their details later.
          </DialogDescription>
        </DialogHeader>
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
          <p className="text-muted-foreground mt-1 text-xs">
            Email delivery of invites arrives with account setup; for now this
            adds the student to your list.
          </p>
        </form>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={createStudent.isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="invite-form"
            disabled={createStudent.isPending}
          >
            {createStudent.isPending ? 'Adding…' : 'Send invite'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
