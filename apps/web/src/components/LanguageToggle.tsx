import { Languages } from 'lucide-react'
import { LANGS, useT, type Lang } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/**
 * The language control for surfaces with no sidebar — sign-in, invite
 * acceptance, onboarding, the public pay page. Signed-in users get the same
 * choice from `UserMenu`; both write the one preference.
 */
export function LanguageToggle({ className }: { className?: string }) {
  const { lang, setLang, t } = useT()
  const short = LANGS.find((l) => l.value === lang)?.short ?? 'EN'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t('user.language')}
          className={cn('text-muted-foreground gap-1.5', className)}
        >
          <Languages className="size-4" />
          {short}
        </Button>
      </DropdownMenuTrigger>
      {/* Wide enough that "Bahasa Melayu" stays on one line. */}
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuRadioGroup
          value={lang}
          onValueChange={(value) => setLang(value as Lang)}
        >
          {LANGS.map((l) => (
            <DropdownMenuRadioItem key={l.value} value={l.value}>
              <span className="text-muted-foreground w-6 text-xs font-medium">
                {l.short}
              </span>
              <span className="whitespace-nowrap">{l.label}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
