import { useAcademy } from '@/lib/academy'
import { useT } from '@/lib/i18n'
import { AcademyProfileCard } from '@/features/settings/AcademyProfileCard'
import { ToyyibPaySettingsCard } from '@/features/settings/ToyyibPaySettingsCard'

export function SettingsPage() {
  const { activeAcademyId, active } = useAcademy()
  const { t } = useT()
  const isAdmin = active?.role === 'admin'

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
        {!isAdmin ? (
          <div className="text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm">
            {t('settings.admin_only')}
          </div>
        ) : activeAcademyId ? (
          <>
            <AcademyProfileCard academyId={activeAcademyId} />
            <ToyyibPaySettingsCard academyId={activeAcademyId} />
          </>
        ) : null}
      </div>
    </div>
  )
}
