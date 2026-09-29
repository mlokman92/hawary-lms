import { useEffect, useState, type FormEvent } from 'react'
import { CheckCircle2, KeyRound, Loader2 } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { Badge } from '@/components/ui/badge'
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
import { Switch } from '@/components/ui/switch'
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
import { formatMYR, ringgitToSen } from '@hawary/shared'
import { TOYYIBPAY_FPX_FEE_SEN } from '@/features/payments/api'
import {
  usePaymentSettings,
  useRemoveToyyibpay,
  useSaveToyyibpay,
  useSetChargeToPayor,
  useSetGatewayEnabled,
  useSetPartialDefault,
  type PaymentSettings,
} from './api'
import { errorMessage } from '@/lib/errors'

export function ToyyibPaySettingsCard({ academyId }: { academyId: string }) {
  const { t } = useT()
  const { data: settings, isLoading } = usePaymentSettings(academyId)
  const save = useSaveToyyibpay(academyId)
  const setEnabled = useSetGatewayEnabled(academyId)
  const setChargeToPayor = useSetChargeToPayor(academyId)
  const remove = useRemoveToyyibpay(academyId)

  const connected = !!settings?.toyyibpay_has_secret
  const [replacing, setReplacing] = useState(false)
  const [secretKey, setSecretKey] = useState('')
  // Default to a Live key; admins flip Sandbox on only for testing.
  const [isSandbox, setIsSandbox] = useState(false)
  const [categoryCode, setCategoryCode] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [soft, setSoft] = useState<string | null>(null)

  // Only mirror the stored mode when replacing an already-connected key; a fresh
  // connection (no key, or after removal) always defaults to Live.
  useEffect(() => {
    if (settings?.toyyibpay_has_secret) setIsSandbox(settings.toyyibpay_is_sandbox)
  }, [settings])

  const showForm = !connected || replacing

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSoft(null)
    if (secretKey.trim().length < 8) {
      setError(t('settings.toyyibpay.error.key_required'))
      return
    }
    try {
      const res = await save.mutateAsync({
        secretKey: secretKey.trim(),
        isSandbox,
        categoryCode: categoryCode.trim() || undefined,
      })
      if (!res.ok) {
        setSoft(res.message ?? t('settings.toyyibpay.error.verify_failed'))
        return
      }
      setSecretKey('')
      setCategoryCode('')
      setReplacing(false)
    } catch (err) {
      setError(errorMessage(err, t('common.error')))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4" /> {t('settings.toyyibpay.title')}
        </CardTitle>
        <CardDescription>
          {t('settings.toyyibpay.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <p className="text-muted-foreground text-sm">{t('common.loading')}</p>
        ) : (
          <>
            {connected ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                    {t('settings.toyyibpay.connected')}
                    <Badge variant="secondary">
                      {settings?.toyyibpay_is_sandbox
                        ? t('settings.toyyibpay.mode.sandbox')
                        : t('settings.toyyibpay.mode.live')}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {settings?.toyyibpay_category_code
                      ? t('settings.toyyibpay.secret_masked_category', {
                          last4: settings?.toyyibpay_secret_last4 ?? '····',
                          code: settings.toyyibpay_category_code,
                        })
                      : t('settings.toyyibpay.secret_masked', {
                          last4: settings?.toyyibpay_secret_last4 ?? '····',
                        })}
                  </p>
                </div>
                {!replacing ? (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setReplacing(true)
                        setError(null)
                        setSoft(null)
                      }}
                    >
                      {t('settings.toyyibpay.replace_key')}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          disabled={remove.isPending}
                        >
                          {remove.isPending
                            ? t('settings.toyyibpay.removing')
                            : t('settings.toyyibpay.remove_key')}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            {t('settings.toyyibpay.remove_confirm.title')}
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            {t('settings.toyyibpay.remove_confirm.body')}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>
                            {t('common.cancel')}
                          </AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => {
                              setError(null)
                              setSoft(null)
                              remove.mutate()
                            }}
                          >
                            {t('settings.toyyibpay.remove_key')}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                ) : null}
              </div>
            ) : null}

            {connected ? (
              <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="gateway-enabled">
                    {t('settings.toyyibpay.accept_online')}
                  </Label>
                  <p className="text-muted-foreground text-xs">
                    {t('settings.toyyibpay.accept_online.hint')}
                  </p>
                </div>
                <Switch
                  id="gateway-enabled"
                  checked={!!settings?.toyyibpay_enabled}
                  disabled={setEnabled.isPending}
                  onCheckedChange={(v) => setEnabled.mutate(v)}
                />
              </div>
            ) : null}

            {connected ? (
              <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="charge-to-payor">
                    {t('settings.toyyibpay.charge_to_payor')}
                  </Label>
                  <p className="text-muted-foreground text-xs">
                    {t('settings.toyyibpay.charge_to_payor.hint', {
                      amount: formatMYR(TOYYIBPAY_FPX_FEE_SEN),
                    })}
                  </p>
                </div>
                <Switch
                  id="charge-to-payor"
                  checked={!!settings?.toyyibpay_charge_to_payor}
                  disabled={setChargeToPayor.isPending}
                  onCheckedChange={(v) => setChargeToPayor.mutate(v)}
                />
              </div>
            ) : null}

            {connected ? (
              <PartialPaymentDefault academyId={academyId} settings={settings} />
            ) : null}

            {showForm ? (
              <form onSubmit={onSubmit} className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="secret">
                    {t('settings.toyyibpay.secret_label')}
                  </Label>
                  <Input
                    id="secret"
                    type="password"
                    autoComplete="off"
                    value={secretKey}
                    onChange={(e) => setSecretKey(e.target.value)}
                    placeholder={t('settings.toyyibpay.secret_placeholder')}
                  />
                  <p className="text-muted-foreground text-xs">
                    {t('settings.toyyibpay.secret_hint')}
                  </p>
                </div>

                {/* Advanced settings are hidden by default so a non-technical
                    admin just pastes their (live) key and connects. */}
                {showAdvanced ? (
                  <div className="grid gap-4 rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-4">
                      <div className="space-y-0.5">
                        <Label htmlFor="sandbox">
                          {t('settings.toyyibpay.sandbox_label')}
                        </Label>
                        <p className="text-muted-foreground text-xs">
                          {t('settings.toyyibpay.sandbox_hint')}
                        </p>
                      </div>
                      <Switch
                        id="sandbox"
                        checked={isSandbox}
                        onCheckedChange={setIsSandbox}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="category">
                        {t('settings.toyyibpay.category_label')}
                      </Label>
                      <Input
                        id="category"
                        value={categoryCode}
                        onChange={(e) => setCategoryCode(e.target.value)}
                        placeholder={t('settings.toyyibpay.category_placeholder')}
                      />
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground justify-self-start text-xs underline"
                    onClick={() => setShowAdvanced(true)}
                  >
                    {t('settings.toyyibpay.advanced')}
                  </button>
                )}

                {error ? <p className="text-destructive text-sm">{error}</p> : null}
                {soft ? (
                  <p className="text-sm text-amber-600 dark:text-amber-400">{soft}</p>
                ) : null}

                <div className="flex items-center gap-2">
                  <Button type="submit" disabled={save.isPending}>
                    {save.isPending ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />{' '}
                        {t('settings.toyyibpay.verifying')}
                      </>
                    ) : connected ? (
                      t('settings.toyyibpay.save_new_key')
                    ) : (
                      t('settings.toyyibpay.connect')
                    )}
                  </Button>
                  {replacing ? (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setReplacing(false)
                        setSecretKey('')
                        setError(null)
                        setSoft(null)
                      }}
                    >
                      {t('common.cancel')}
                    </Button>
                  ) : null}
                </div>
              </form>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * The academy's default instalment terms.
 *
 * The mirror of `PartialPaymentTerms` on the invoice, one level up — same two
 * controls, same idiom, and deliberately not a shared component: this one has
 * no balance to clamp the minimum against, and the invoice one has no concept
 * of a default to fall back to.
 *
 * An invoice that states its own terms is unaffected by anything set here;
 * `create-bill` reads `invoice ?? academy` under the service role.
 */
function PartialPaymentDefault({
  academyId,
  settings,
}: {
  academyId: string
  settings: PaymentSettings | null | undefined
}) {
  const { t } = useT()
  const update = useSetPartialDefault(academyId)
  const allow = !!settings?.allow_partial_payment
  const storedSen = settings?.min_partial_sen ?? null

  const [minimum, setMinimum] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Re-seed whenever the stored value changes, including after our own save, so
  // the field always shows what is actually in force.
  useEffect(() => {
    setMinimum(storedSen == null ? '' : (storedSen / 100).toFixed(2))
    setError(null)
  }, [storedSen])

  const typedSen = ringgitToSen(minimum)
  const dirty = (storedSen ?? 0) !== typedSen

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
    // Blank means "no floor of ours" — ToyyibPay's RM1.00 then applies.
    if (minimum.trim() && typedSen < TOYYIBPAY_FPX_FEE_SEN) {
      setError(
        t('payments.partial.error_min', {
          min: formatMYR(TOYYIBPAY_FPX_FEE_SEN),
        }),
      )
      return
    }
    void save({
      allowPartial: true,
      minPartialSen: minimum.trim() ? typedSen : null,
    })
  }

  return (
    <div className="grid gap-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <Label htmlFor="partial-default">
            {t('settings.toyyibpay.partial_default')}
          </Label>
          <p className="text-muted-foreground text-xs">
            {t('settings.toyyibpay.partial_default.hint')}
          </p>
        </div>
        <Switch
          id="partial-default"
          checked={allow}
          disabled={update.isPending}
          onCheckedChange={(v) =>
            void save({ allowPartial: v, minPartialSen: v ? storedSen : null })
          }
        />
      </div>

      {allow ? (
        <div className="grid gap-1.5">
          <Label htmlFor="partial-default-min">
            {t('payments.partial.minimum')}
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id="partial-default-min"
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
          {error ? <p className="text-destructive text-xs">{error}</p> : null}
        </div>
      ) : null}
    </div>
  )
}
