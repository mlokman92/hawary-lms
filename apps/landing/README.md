# apps/landing

Static marketing page for the apex domain **hawary.my** — wordmark, one-line
pitch, and the two calls to action (Sign up / Log in) that point at the real
app on `app.hawary.my`. Plain HTML/CSS, no build step, no framework: the page
has nothing dynamic in it, so a Vite/React app would just be dead weight.

Colors, font (Figtree) and the "Hawary **LMS**" wordmark treatment are
hand-copied from `apps/web/src/index.css` and `AuthCard.tsx` so this page
reads as the same product as the signed-out app screens. There's no shared
source of truth between them — a rebrand needs updating both.

## Local preview

Open `index.html` directly, or serve it:

```bash
npx serve apps/landing
```

## Deploy (one-time setup)

This is deliberately a **separate Netlify site** from `apps/web` — a single
Netlify site publishes one directory, and `hawary.my` / `app.hawary.my` need
different content, so they can't share the `apps/web` site.

1. Netlify → **Add new site** → same repo as the rest of the monorepo.
2. **Base directory**: `apps/landing`. Leave the build command empty
   (`netlify.toml` here sets `publish = "."`).
3. **Domain management** → add `hawary.my` and `www.hawary.my` as custom
   domains on *this* site; Netlify offers to redirect one to the other once
   both are verified. Follow the DNS records Netlify shows for the apex
   domain — exact steps depend on your registrar / whether you delegate to
   Netlify DNS.
4. Do **not** add `hawary.my` to the `apps/web` site — each hostname can
   only be attached to one Netlify site at a time.

## Editing

The two buttons are plain links to `https://app.hawary.my/signup` and
`https://app.hawary.my/signin` (`App.tsx`'s actual route names) — update
`index.html` directly if those routes ever change.
