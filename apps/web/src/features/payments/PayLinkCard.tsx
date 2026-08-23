import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Link2, Mail, RefreshCw } from 'lucide-react'
import { formatMYR, ringgitToSen } from '@hawary/shared'
import { useT } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { InviteLink } from '@/features/students/InviteLink'
import { usePaymentSettings } from '@/features/settings/api'
import {
  useCheckPayment,
  useEnsurePayToken,
  useSendPayLink,
  useUpdatePaymentTerms,
  TOYYIBPAY_FPX_FEE_SEN,
  type SendPayLinkResult,
  type VerifyResult,
} from './api'
import { errorMessage } from '@/lib/errors'

export function PayLinkCard({
  academyId,
  invoiceId,
  initialToken,
  canPay,
  allowPartial,
  minPartialSen,
  balanceSen,
}: {
  academyId: string
  invoiceId: string
  initialToken: string | null
  canPay: boolean
  allowPartial: boolean
  minPartialSen: number | null
  balanceSen: number
}) {
  const { t } = useT()
  const { data: settings } = usePaymentSettings(academyId)
  const ensureToken = useEnsurePayToken()
  const sendLink = useSendPayLink()
  const check = useCheckPayment(academyId, invoiceId)

  const [token, setToken] = useState<string | null>(initialToken)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<SendPayLinkResult | null>(null)
  const [checked, setChecked] = useState<VerifyResult | null>(null)

  const enabled = !!settings?.toyyibpay_enabled
  const payUrl = token ? `${window.location.origin}/pay/${token}` : null

  async function share() {
    setError(null)
    try {
      const t = await ensureToken.mutateAsync(invoiceId)
      setToken(t)
    } catch (err) {
      setError(errorMessage(err, t('payments.pay_link.error_create')))
    }
  }

  async function email() {
    setError(null)
    setSent(null)
    try {
      setSent(await sendLink.mutateAsync(invoiceId))
    } catch (err) {
      setSent({
        ok: false,
        code: 'send_failed',
        message:
          errorMessage(err, t('payments.error.email_failed')),
      })
    }
  }

  async function checkStatus() {
    if (!token) return
    setError(null)
    setChecked(null)
    try {
      setChecked(await check.mutateAsync(token))
    } catch (err) {
      setError(errorMessage(err, t('payments.pay_link.error_check')))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="size-4" /> {t('payments.pay_link.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!enabled ? (
          <p className="text-muted-foreground text-sm">
            {t('payments.pay_link.disabled')}{' '}
            <Link to="/settings" className="text-primary underline underline-offset-4">
              {t('payments.pay_link.connect')}
            </Link>{' '}
            {t('payments.pay_link.disabled_suffix')}
          </p>
        ) : !canPay ? (
          <p className="text-muted-foreground text-sm">
            {t('payments.pay_link.not_payable')}
          </p>
        ) : (
          <>
            <p className="text-muted-foreground text-sm">
              {t('payments.pay_link.intro')}
            </p>

            <PartialPaymentTerms
              academyId={academyId}
              invoiceId={invoiceId}
              allowPartial={allowPartial}
              minPartialSen={minPartialSen}
              balanceSen={balanceSen}
            />

            {payUrl ? (
              <div className="space-y-3">
                <InviteLink url={payUrl} />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void email()}
                    disabled={sendLink.isPending}
                  >
                    <Mail />{' '}
                    {sendLink.isPending
                      ? t('common.sending')
                      : t('payments.pay_link.email')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void checkStatus()}
                    disabled={check.isPending}
                  >
                    <RefreshCw className={check.isPending ? 'animate-spin' : ''} />
                    {check.isPending
                      ? t('payments.pay_link.checking')
                      : t('payments.pay_link.check')}
                  </Button>
                  <Button asChild type="button" variant="ghost" size="sm">
                    <a href={payUrl} target="_blank" rel="noreferrer">
                      {t('payments.pay_link.preview')}
                    </a>
                  </Button>
                </div>
                {sent ? (
                  sent.ok ? (
                    <p className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="size-4" />
                      {sent.to
                        ? t('payments.pay_link.sent_to', { email: sent.to })
                        : t('payments.pay_link.sent')}
                    </p>
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      {sent.message ?? t('payments.pay_link.send_failed')}
                    </p>
                  )
                ) : null}
                {checked ? (
                  checked.invoice_status === 'paid' ? (
                    <p className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="size-4" />{' '}
                      {t('payments.pay_link.confirmed')}
                    </p>
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      {t('payments.pay_link.not_found_yet')}
                    </p>
                  )
                ) : null}
              </div>
            ) : (
              <Button onClick={() => void share()} disabled={ensureToken.isPending}>
                <Link2 />{' '}
                {ensureToken.isPending
                  ? t('common.creating')
                  : t('payments.pay_link.create')}
              </Button>
            )}

            {error ? <p className="text-destructive text-sm">{error}</p> : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Whether this invoice may be settled in instalments online, and the smallest
 * one accepted.
 *
 * It sits on the invoice rather than in Settings because instalments are agreed
 * per bill, and it is editable after issue because that is when the student
 * asks. The switch writes immediately — it is one boolean and the pay link may
 * already be in someone's inbox — while the minimum has an explicit Save, since
 * a half-typed figure must never be what the payer is held to.
 *
 * Everything here is a convenience for the admin: `create-bill` re-reads both
 * columns under the service role before it raises a bill.
 */
function PartialPaymentTerms({
  academyId,
  invoiceId,
  allowPartial,
  minPartialSen,
  balanceSen,
}: {
  academyId: string
  invoiceId: string
  allowPartial: boolean
  minPartialSen: number | null
  balanceSen: number
}) {
  const { t } = useT()
  const update = useUpdatePaymentTerms(academyId, invoiceId)
  const [minimum, setMinimum] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Re-seed whenever the stored value changes (including after our own save),
  // so the field always shows what is actually in force.
  useEffect(() => {
    setMinimum(minPartialSen == null ? '' : (minPartialSen / 100).toFixed(2))
    setError(null)
  }, [minPartialSen])

  const typedSen = ringgitToSen(minimum)
  const dirty = (minPartialSen ?? 0) !== typedSen

  async function save(next: {
    allowPartial: boolean
    minPartialSen: number | null
  }) {
    setError(null)
    try {
      await update.mutateAsync(next)
    } catch (err) {
      setError(errorMessage(err, t('common.error')))
    }
  }

  function saveMinimum() {
    // Blank means "no floor of ours" — ToyyibPay's RM1.00 then applies. A typed
    // figure has to clear that floor and still leave the invoice payable.
    if (minimum.trim() && typedSen < TOYYIBPAY_FPX_FEE_SEN) {
      setError(
        t('payments.partial.error_min', {
          min: formatMYR(TOYYIBPAY_FPX_FEE_SEN),
        }),
      )
      return
    }
    if (typedSen > balanceSen) {
      setError(
        t('payments.partial.error_max', { max: formatMYR(balanceSen) }),
      )
      return
    }
    void save({ allowPartial: true, minPartialSen: minimum.trim() ? typedSen : null })
  }

  return (
    <div className="grid gap-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <Label htmlFor="allow-partial">{t('payments.partial.allow')}</Label>
          <p className="text-muted-foreground text-xs">
            {t('payments.partial.allow_hint', {
              fee: formatMYR(TOYYIBPAY_FPX_FEE_SEN),
            })}
          </p>
        </div>
        <Switch
          id="allow-partial"
          checked={allowPartial}
          disabled={update.isPending}
          onCheckedChange={(v) =>
            void save({ allowPartial: v, minPartialSen: v ? minPartialSen : null })
          }
        />
      </div>

      {allowPartial ? (
        <div className="grid gap-1.5">
          <Label htmlFor="min-partial">{t('payments.partial.minimum')}</Label>
          <div className="flex items-center gap-2">
            <Input
              id="min-partial"
              type="number"
              min="1"
              step="0.01"
              value={minimum}
              onChange={(e) => {
                setMinimum(e.target.value)
                setError(null)
              }}
              placeholder={t('payments.partial.minimum_placeholder')}
              aria-invalid={!!error}
              className="max-w-40"
            />
            {dirty ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={saveMinimum}
                disabled={update.isPending}
              >
                {update.isPending ? t('common.saving') : t('common.save')}
              </Button>
            ) : null}
          </div>
          <p className={error ? 'text-destructive text-xs' : 'text-muted-foreground text-xs'}>
            {error ??
              t('payments.partial.minimum_hint', {
                min: formatMYR(TOYYIBPAY_FPX_FEE_SEN),
              })}
          </p>
        </div>
      ) : null}
    </div>
  )
}
