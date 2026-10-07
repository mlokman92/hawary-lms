# Hawary mobile apps

One Expo project that builds two apps:

- **Hawary Student LMS** — `APP_VARIANT=student`, routes in `src/app-student`
- **Hawary Academy LMS** — `APP_VARIANT=academy`, routes in `src/app-academy`

Everything else under `src/` is shared. The decisions, and what each app does
and does not contain, are in [docs/mobile-apps.md](../../docs/mobile-apps.md) —
read it before changing anything here.

## Run

```bash
cp .env.example .env.local      # then fill in the two Supabase values
pnpm dev:student                # or: pnpm dev:academy
```

Push notifications, the camera, the calendar and PDF sharing need a development
build on a device (`eas build --profile student-development`); Expo Go will not
do.

## Check

```bash
pnpm typecheck
pnpm export:student             # bundles the JS without a native build
pnpm export:academy
pnpm sync:check                 # are the copied web data hooks up to date?
```

## Layout

```
app.config.ts          the two variants: name, ids, scheme, route root
eas.json               build profiles — <variant>-development | -preview | -production
scripts/sync-web-data.mjs   copies apps/web's data hooks into src/ (see below)
src/
  app-student/         the Student app's screens (expo-router)
  app-academy/         the Academy app's screens
  shell/               providers, the sign-in gate, tabs, deep-link mapping
  screens/             screens both apps mount (auth, LPKC thread, notifications…)
  features/            data hooks and feature components
  lib/                 supabase, auth, i18n, storage, push, calendar
  ui/                  the component kit
```

## The synced files

Most of `src/features/*/api.ts` and several files in `src/lib` are **copies** of
the web app's, made by `pnpm sync:data`. Each starts with a header saying so.
Do not edit them here: change the file in `apps/web/src`, run the script, and
commit both.
