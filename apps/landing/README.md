# apps/landing

Marketing page for the apex domain **hawary.my** — wordmark, one-line pitch,
and the two calls to action (Sign up / Log in) that point at the real app on
`app.hawary.my`. Next.js (App Router) + shadcn/ui, statically exported — the
page has nothing dynamic in it, so it ships as plain HTML/CSS/JS with no
server to run.

Colors, font (Figtree) and the "Hawary **LMS**" wordmark treatment are
hand-copied from `apps/web/src/index.css` and `AuthCard.tsx` so this page
reads as the same product as the signed-out app screens; `src/components/ui/button.tsx`
is copied verbatim from `apps/web` for the same reason. There's no shared
source of truth between the two apps (this one intentionally has no
dependency on `@hawary/shared`, since it talks to no backend) — a rebrand
needs updating both.

## Local dev

```bash
pnpm --filter landing dev     # http://localhost:3000
pnpm --filter landing build   # static export -> apps/landing/out
```

## Deploy (one-time setup)

This is deliberately a **separate Netlify site** from `apps/web` — a single
Netlify site publishes one directory, and `hawary.my` / `app.hawary.my` need
different content, so they can't share the `apps/web` site.

1. Netlify → **Add new site** → same repo as the rest of the monorepo.
2. **Base directory**: `apps/landing` (Netlify finds `netlify.toml` here,
   which sets the build command and `publish = "out"`). See the comment at
   the top of `netlify.toml` for why this differs from `apps/web`'s site,
   and the fallback if pnpm/workspace resolution ever misbehaves with a
   subdirectory base.
3. **Domain management** → add `hawary.my` and `www.hawary.my` as custom
   domains on *this* site; Netlify offers to redirect one to the other once
   both are verified. Follow the DNS records Netlify shows for the apex
   domain — exact steps depend on your registrar / whether you delegate to
   Netlify DNS.
4. Do **not** add `hawary.my` to the `apps/web` site — each hostname can
   only be attached to one Netlify site at a time.

No environment variables needed — this app makes no Supabase calls.

## Editing

The two buttons are plain `<a>` tags to `https://app.hawary.my/signup` and
`https://app.hawary.my/signin` (`App.tsx`'s actual route names) in
`src/app/page.tsx` — update them directly if those routes ever change.
Add more shadcn components the usual way: `pnpm --filter landing dlx shadcn@latest add <name>`.
