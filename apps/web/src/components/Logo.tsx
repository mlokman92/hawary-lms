import { cn } from '@/lib/utils'

/**
 * The Hawary Academy symbol: an arch with one bright dot standing under it.
 *
 * Two shapes, drawn here rather than loaded so the arch takes the colour of
 * the text around it (`currentColor`) and follows the theme. The dot is always
 * amber. Masters and the reasoning are in `brand/` and docs/brand.md.
 *
 * `small` is the optical cut for 24px and under: wider gaps and a larger dot,
 * on the pixel grid, so nothing fuses in a sidebar tile or a tab.
 */
export function LogoMark({
  small,
  className,
  dot = '#f59e0b',
}: {
  small?: boolean
  className?: string
  /** The lighter amber is for the mark on solid teal only. */
  dot?: string
}) {
  return (
    <svg
      viewBox="0 0 512 512"
      aria-hidden="true"
      className={cn('shrink-0', className)}
    >
      {small ? (
        <>
          <path
            fill="currentColor"
            d="M0 480V256A256 256 0 0 1 512 256V480H416V256A160 160 0 0 0 96 256V480Z"
          />
          <circle fill={dot} cx="256" cy="384" r="96" />
        </>
      ) : (
        <>
          <path
            fill="currentColor"
            d="M40 440V272A216 216 0 0 1 472 272V440H376V272A120 124 0 0 0 136 272V440Z"
          />
          <circle fill={dot} cx="256" cy="371" r="72" />
        </>
      )}
    </svg>
  )
}

/** The symbol in its tile, as the app icon shows it: white on the brand teal. */
export function LogoTile({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg',
        className,
      )}
    >
      <LogoMark small dot="#fbbf24" className="size-[18px]" />
    </div>
  )
}

/** Symbol and name on one line, for the pages nobody is signed in to. */
export function Logo({
  name = 'Academy',
  className,
}: {
  /** The second word: "Academy" for the academy itself, "LMS" for the product. */
  name?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'text-primary flex items-center justify-center gap-2.5 text-xl tracking-tight dark:text-teal-400',
        className,
      )}
    >
      <LogoMark className="size-9" />
      <span>
        <span className="font-bold">Hawary</span>{' '}
        <span className="font-medium">{name}</span>
      </span>
    </div>
  )
}
