import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ringgitToSen } from '@hawary/shared'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useCreateIncentiveBatch } from './api'

/** The grant this was built for is RM500 a head, so that is what the field
 *  opens on — it is still a plain text input, not a fixed amount. */
const DEFAULT_AMOUNT = '500.00'

export function NewIncentiveDialog({
  academyId,
  open,
  onOpenChange,
}: {
  academyId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useT()
  const navigate = useNavigate()
  const create = useCreateIncentiveBatch(academyId)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState(DEFAULT_AMOUNT)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setTitle('')
    setDescription('')
    setAmount(DEFAULT_AMOUNT)
    setError(null)
  }, [open])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const amountSen = ringgitToSen(amount)
    if (!title.trim()) return setError(t('incentives.new.title_required'))
    if (amountSen <= 0) return setError(t('incentives.new.amount_required'))
    try {
      const id = await create.mutateAsync({
        title: title.trim(),
        description: description.trim(),
        amountSen,
      })
      onOpenChange(false)
      navigate(`/incentives/${id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>{t('incentives.new.title')}</DialogTitle>
            <DialogDescription>
              {t('incentives.new.description')}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="incentive-title">{t('common.title')}</Label>
              <Input
                id="incentive-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('incentives.new.title_placeholder')}
                autoFocus
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="incentive-description">
                {t('common.description')}
              </Label>
              <Textarea
                id="incentive-description"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('incentives.new.description_placeholder')}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="incentive-amount">
                {t('incentives.amount_per_student')}
              </Label>
              <Input
                id="incentive-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>

            {error ? <p className="text-destructive text-sm">{error}</p> : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? t('common.creating') : t('common.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
