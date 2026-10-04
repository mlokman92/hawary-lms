import { useAcademy } from '@/lib/academy'
import { useT } from '@/lib/i18n'
import { AcademyProfileCard } from '@/features/settings/AcademyProfileCard'
import { BillplzSettingsCard } from '@/features/settings/BillplzSettingsCard'
import { ToyyibPaySettingsCard } from '@/features/settings/ToyyibPaySettingsCard'

/** Director-only, gated on the route (`DirectorRoute`). */
export function SettingsPage() {
  const { activeAcademyId } = useAcademy()
  const { t } = useT()

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('settings.title')}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {t('settings.subtitle')}
        </p>
      </div>

      <div className="mt-6 space-y-6">
        {activeAcademyId ? (
          <>
            <AcademyProfileCard academyId={activeAcademyId} />
            <ToyyibPaySettingsCard academyId={activeAcademyId} />
            <BillplzSettingsCard academyId={activeAcademyId} />
          </>
        ) : null}
      </div>
    </div>
  )
}
