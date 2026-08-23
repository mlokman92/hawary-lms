import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { MALAYSIAN_BANKS, bankName, maskAccountNumber } from '@hawary/shared'
import { useT } from '@/lib/i18n'
import { ErrorBlock } from '@/components/patterns/QueryState'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import {
  useRemoveStudentBankAccount,
  useSaveStudentBankAccount,
  useStudentBankAccount,
} from './api'
import { errorMessage } from '@/lib/errors'

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-0.5 text-sm">
        {value || <span className="text-muted-foreground">—</span>}
      </dd>
    </div>
  )
}

/**
 * One card for both surfaces: the admin editing a student's payout destination
 * on `/students/:id`, and the student editing their own on `/learn/profile`.
 * The two are the same row under the same policy, so they are the same form.
 */
export function BankAccountCard({
  academyId,
  studentId,
  canEdit,
}: {
  academyId: string
  studentId: string
  canEdit: boolean
}) {
  const { t } = useT()
  const { data: account, isLoading, error } = useStudentBankAccount(studentId)
  const save = useSaveStudentBankAccount(academyId, studentId)
  const remove = useRemoveStudentBankAccount(academyId, studentId)

  const [bankCode, setBankCode] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [holder, setHolder] = useState('')
  const [ic, setIc] = useState('')
  const [seeded, setSeeded] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // `undefined` is "still loading"; `null` is "no row", which seeds an empty
  // form rather than leaving the fields waiting for data that will never come.
  useEffect(() => {
    if (seeded || account === undefined) return
    setBankCode(account?.bank_code ?? '')
    setAccountNumber(account?.bank_account_number ?? '')
    setHolder(account?.account_holder_name ?? '')
    setIc(account?.account_holder_ic ?? '')
    setSeeded(true)
  }, [seeded, account])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    try {
      const row = await save.mutateAsync({
        bank_code: bankCode,
        bank_account_number: accountNumber,
        account_holder_name: holder,
        account_holder_ic: ic || null,
      })
      // Show what was actually stored — the account number is normalised on the
      // way in, so what was typed and what will be paid can differ.
      setBankCode(row.bank_code)
      setAccountNumber(row.bank_account_number)
      setHolder(row.account_holder_name)
      setIc(row.account_holder_ic ?? '')
    } catch (e2) {
      setErr(errorMessage(e2, t('common.error')))
    }
  }

  async function onRemove() {
    setErr(null)
    try {
      await remove.mutateAsync()
      setBankCode('')
      setAccountNumber('')
      setHolder('')
      setIc('')
    } catch (e2) {
      setErr(errorMessage(e2, t('common.error')))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('incentives.bank.title')}</CardTitle>
        <CardDescription>{t('incentives.bank.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground text-sm">{t('common.loading')}</p>
        ) : error ? (
          <ErrorBlock error={error} />
        ) : !canEdit ? (
          account ? (
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t('incentives.bank.bank')}
                value={bankName(account.bank_code)}
              />
              <Field
                label={t('incentives.bank.account_number')}
                value={maskAccountNumber(account.bank_account_number)}
              />
              <Field
                label={t('incentives.bank.holder')}
                value={account.account_holder_name}
              />
              <Field
                label={t('incentives.bank.holder_ic')}
                value={account.account_holder_ic}
              />
            </dl>
          ) : (
            <p className="text-muted-foreground text-sm">
              {t('incentives.bank.empty')}
            </p>
          )
        ) : (
          <form onSubmit={onSubmit} className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="bank_code">{t('incentives.bank.bank')}</Label>
                <Select value={bankCode} onValueChange={setBankCode}>
                  <SelectTrigger id="bank_code" className="w-full">
                    <SelectValue
                      placeholder={t('incentives.bank.bank_placeholder')}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {MALAYSIAN_BANKS.map((b) => (
                      <SelectItem key={b.code} value={b.code}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bank_account_number">
                  {t('incentives.bank.account_number')}
                </Label>
                <Input
                  id="bank_account_number"
                  inputMode="numeric"
                  autoComplete="off"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder={t('incentives.bank.account_number_placeholder')}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="account_holder_name">
                  {t('incentives.bank.holder')}
                </Label>
                <Input
                  id="account_holder_name"
                  value={holder}
                  onChange={(e) => setHolder(e.target.value)}
                  placeholder={t('incentives.bank.holder_placeholder')}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="account_holder_ic">
                  {t('incentives.bank.holder_ic')}
                </Label>
                <Input
                  id="account_holder_ic"
                  value={ic}
                  onChange={(e) => setIc(e.target.value)}
                  placeholder="XXXXXX-XX-XXXX"
                />
              </div>
            </div>

            {err ? <p className="text-destructive text-sm">{err}</p> : null}

            <div className="flex items-center gap-2">
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? t('common.saving') : t('common.save')}
              </Button>
              {account ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      disabled={remove.isPending}
                    >
                      {remove.isPending
                        ? t('incentives.bank.removing')
                        : t('common.remove')}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {t('incentives.bank.remove_confirm.title')}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {t('incentives.bank.remove_confirm.body')}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                      <AlertDialogAction onClick={onRemove}>
                        {t('common.remove')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : null}
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
