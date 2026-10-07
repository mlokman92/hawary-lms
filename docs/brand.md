# Brand

The Hawary Academy logo, where its files are, and why it looks the way it does.
Chosen by the owner on 2026-10-07, replacing the glossy green-and-gold shield.

## The symbol

**An arch with one bright dot standing under it** — the carer over the child,
the academy over the trainee, a doorway (*gerbang*) into a profession. Two
shapes: a teal arch with flat feet and an amber dot on the same ground line.

The owner asked for "an entirely new logo … modern and simple … a new brand
identity". Seven directions were drawn and judged at the sizes a logo is really
seen at (16px tab, 48px app icon); three were refined and shown, and the owner
picked this one over an h-that-is-a-person and a capital H built from blocks.

What it cannot do, known when it was chosen: it has no link to the letter H, so
**the name always travels with it** where there is room; and it can be read as
a lowercase n or a door before it is read as shelter.

**No trademark or look-alike search has been done.** Do one before signage is
printed or the mark is registered.

## Colour and type

| | light surfaces | dark surfaces |
| --- | --- | --- |
| arch | teal `#0f766e` | teal `#2dd4bf` |
| dot | amber `#f59e0b` | amber `#f59e0b` |
| name | teal `#0f766e` | `#fafafa` |

On a **solid teal** ground (the Academy app icon, the sidebar tile) the arch is
white and the dot is the lighter amber `#fbbf24` — the standard amber is too
close to teal there. That is the only place the lighter amber is used.

The name is set in **Figtree**: "Hawary" Bold, "Academy" Medium. Teal is the
product's own colour (`apps/web/src/index.css`, `apps/mobile/src/ui/theme.tsx`),
so the logo and the interface are one thing. Colour is separable from the
drawing: the symbol works in one colour and can be re-inked without redrawing.

## Files — `brand/`

SVG masters (the source of truth) and PNG exports in `brand/png/`.

| file | use |
| --- | --- |
| `mark.svg`, `mark-reverse.svg`, `mark-mono.svg` | the symbol: light, dark, one colour |
| `mark-small*.svg` | the **optical cut for 24px and under** — wider gaps, larger dot, on the pixel grid |
| `lockup.svg`, `lockup-reverse.svg`, `lockup-mono.svg` | symbol + name on one line |
| `lockup-stacked*.svg` | symbol above the name, for square spaces |
| `icon-student.svg`, `icon-academy.svg` | the two app icons |
| `favicon.svg` | the browser tab (follows the browser's theme) |

The wordmark in the lockups is outlines, not text, so the files need no font.

## Where it is used

- **Web** — `apps/web/src/components/Logo.tsx` draws it inline (`LogoMark`,
  `LogoTile`, `Logo`), so the arch takes `currentColor` and follows the theme:
  the sidebar tile, the sign-in card, the public enrol/pay pages when no
  academy is loaded. `public/favicon.svg` is a copy of `brand/favicon.svg`.
- **Mobile** — `apps/mobile/assets/images/`: per-app `icon.png` and adaptive
  layers, `splash-icon.png`, `notification-icon.png` (white on nothing),
  `logo-tile.png` on the sign-in screens. See
  [mobile-apps.md](mobile-apps.md) → "Icons".
- **Student against Academy app**: the same symbol, **white ground against teal
  ground**. A difference of lightness survives greyscale and colour-blindness;
  a small badge under an identical emblem does not survive 48px.

Not from these files: **the logo on invoices, receipts and the public enrol
page is the academy's own `logo_url`**, uploaded in Settings. It stays the old
shield until the owner uploads `brand/png/logo-square-1024.png` there.
Transactional email is text only.
