# Plan · CI/CD strategy

Hawary LMS ships **three independently-deployed targets** out of one monorepo, plus a
shared quality gate. Keeping them decoupled is the whole point of the monorepo.

| Target | What | Deploys via | Trigger |
|--------|------|-------------|---------|
| **Web** | `apps/web` (Vite SPA) | **Netlify** | git push (main → prod, PR → preview) |
| **Mobile** | `apps/mobile` (Expo) | **Expo EAS** (Update / Build / Submit) | CI on push + release tags |
| **Database** | `supabase/migrations` | **Supabase CLI** (`db push`) | push to main touching migrations |
| **Quality gate** | lint · typecheck · test | **GitHub Actions** | every PR + push |

Division of labour: **GitHub Actions** runs checks + orchestrates DB/mobile; **Netlify**
owns the web build/deploy/previews; **EAS** owns mobile binaries + OTA.

---

## Branch & release strategy

Recommended (adopt once there's more than one committer):

- `main` is always deployable. **Protect it**: require the CI check + 1 review, no direct
  pushes.
- Work on short-lived branches → PR → **Netlify deploy preview** + CI run → squash-merge.
- **Releases are tags**, not branches: `v1.2.0` triggers a production mobile build/submit.
  Web and DB deploy continuously from `main`; mobile *stores* release on tags (OTA in
  between).

Solo/early phase: pushing to `main` directly is fine short-term, but wire the checks now
so they're there when the team grows.

---

## 1. Web — Netlify

**Verdict:** 👍 Good fit. Netlify auto-building `main` for a Vite SPA is a solid, low-ops
choice. Two things make or break it in a monorepo, plus one workflow tweak:

1. **Build it as a monorepo** (install at the root, build only web via turbo).
2. **Skip builds when only mobile/docs change** (`turbo-ignore`), or you'll burn build
   minutes and redeploy web for unrelated commits.
3. **Prefer PR previews over pushing straight to prod** — every PR gets a throwaway URL to
   review before it hits `main`.

Alternatives are Vercel (tightest Turborepo integration + free remote cache) and
Cloudflare Pages (cheapest bandwidth). Netlify is entirely fine — no need to switch.

**`netlify.toml`** (repo root):

```toml
[build]
  command = "pnpm turbo run build --filter=web..."
  publish = "apps/web/dist"
  ignore  = "npx turbo-ignore web"

[build.environment]
  NODE_VERSION = "20"
  # pnpm is auto-detected from the root package.json "packageManager" field.

# SPA fallback: client-side routing needs every path served index.html.
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

- **Env vars** (Netlify UI → Site settings → Environment): `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_PUBLISHABLE_KEY`. Only `VITE_`-prefixed vars reach the bundle; the
  publishable key is safe to expose (RLS bounds it). Same values are fine for previews.
- **Deploy contexts**: `production` (main) and `deploy-preview` (PRs) can point at the
  same Supabase project for now; move previews to a **staging Supabase project** later.
- Later, when previews should hit isolated data, combine with **Supabase branching**
  (below).

---

## 2. Mobile — Expo EAS

A mobile app doesn't "deploy from git" like a website. Expo splits it into:

- **EAS Update** — push **JS/asset** changes **over-the-air** (no store review). Use for
  most day-to-day changes.
- **EAS Build** — compile the **native binary**. Needed for a new native module, an SDK
  bump, or a store release.
- **EAS Submit** — upload a build to App Store / Play Store.

> **Yes, integrate with git** — but through CI, not a "connect repo and auto-deploy"
> button. The mapping:

| Git event | Action | Result |
|-----------|--------|--------|
| PR | `eas update --branch pr-<n>` (optional) | internal testers preview the change |
| merge → `main` | `eas update --branch preview` | OTA to the internal/preview channel |
| tag `vX.Y.Z` | `eas build --profile production` → `eas submit` | store release binary |

Two ways to run these from GitHub: **GitHub Actions + `expo/expo-github-action`** (most
flexible, and you're already on GitHub — recommended) or **EAS Workflows** (`.eas/
workflows/*.yml`, Expo-hosted). You can also use EAS Workflows just for the heavy build/
submit and Actions for everything else.

**Prerequisites (not done yet):**

- `eas init` (creates `eas.json`, sets `extra.eas.projectId` in `app.json`).
- **Fix `app.json` identifiers** — currently placeholders:
  - `name`: `"Hawary LMS"`, `slug`: `"hawary-lms"`, `scheme`: `"hawarylms"` (deep links).
  - `ios.bundleIdentifier`: e.g. `"com.hawary.lms"`; `android.package`: `"com.hawary.lms"`.
  - `runtimeVersion`: `{ "policy": "fingerprint" }` (SDK 52+) so OTA updates only land on
    compatible native builds.
- **Store accounts**: Apple Developer ($99/yr, TestFlight) + Google Play ($25 once,
  internal testing). EAS manages signing credentials for you.

**`eas.json`** (channels map builds ↔ OTA update streams):

```json
{
  "cli": { "version": ">= 12.0.0", "appVersionSource": "remote" },
  "build": {
    "development": { "developmentClient": true, "distribution": "internal", "channel": "development" },
    "preview":     { "distribution": "internal", "channel": "preview" },
    "production":  { "channel": "production", "autoIncrement": true }
  },
  "submit": { "production": {} }
}
```

**Monorepo requirement:** EAS builds a pnpm monorepo fine, but Metro must be told where the
workspace is — see the metro config in the monorepo section. Without it the mobile bundle
can't resolve `@hawary/shared`.

---

## 3. Database — Supabase migrations

Migrations are code and belong in CI too (we applied the first five by hand via MCP; going
forward, automate). On merge to `main` touching `supabase/migrations/**`:

```yaml
# .github/workflows/db-migrate.yml
name: DB migrate
on:
  push: { branches: [main], paths: ['supabase/migrations/**'] }
jobs:
  migrate:
    runs-on: ubuntu-latest
    env: { SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }} }
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with: { version: latest }
      - run: supabase link --project-ref vpklztxqkvqmmzsxfqgp
      - run: supabase db push --password ${{ secrets.SUPABASE_DB_PASSWORD }}
```

- Secrets: `SUPABASE_ACCESS_TOKEN` (account token), `SUPABASE_DB_PASSWORD`.
- **Never** rewrite an already-applied migration — always add a new one.
- After a schema change, regenerate types (`supabase gen types typescript`) and commit
  the updated `packages/shared/src/db/database.types.ts` (can be a CI step that opens a PR).
- **Previews:** Supabase **branching** (paid) spins up an isolated DB per PR so preview web
  builds and migration tests never touch production. Optional; add when it's worth it.

---

## 4. Shared CI — GitHub Actions

One workflow installs the workspace once and runs the gate across everything, only doing
work for packages actually affected by the diff.

```yaml
# .github/workflows/ci.yml
name: CI
on:
  pull_request:
  push: { branches: [main] }
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }          # turbo needs history for "affected"
      - uses: pnpm/action-setup@v4          # reads packageManager from package.json
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo run lint typecheck test --filter='...[origin/main]'
```

- `--filter='...[origin/main]'` runs tasks only for packages changed vs `main` (and their
  dependents) — fast PRs.
- **Remote cache** (optional, big CI speedup): `turbo login && turbo link` (Vercel's free
  remote cache) or self-host; then Netlify/Actions share build artifacts.
- Add a `test` task per package as tests appear (Vitest for web/shared, jest-expo for
  mobile).

---

## 5. Monorepo guide

**Layout**

```
apps/web        → Vite app          (private, not published)
apps/mobile     → Expo app          (private, not published)
packages/shared → @hawary/shared    (consumed via workspace:*)
```

**pnpm workspaces** — one `pnpm-lock.yaml`, packages linked by the `workspace:*` protocol
(`apps/*` already depend on `@hawary/shared`). Handy commands:

```bash
pnpm --filter web dev            # one package
pnpm --filter @hawary/shared typecheck
pnpm -r exec <cmd>               # every package
pnpm add <pkg> --filter web      # add a dep to one package
```

`.npmrc` pins `node-linker=hoisted` — **required** so React Native/Expo resolve modules
from a flat `node_modules` (already set).

**Turborepo** — `turbo.json` declares the task graph. `dependsOn: ["^build"]` means a
package's task waits for its dependencies' builds. `turbo run build --filter=web...` builds
web + its deps; results are **cached** (local, and remote in CI) so unchanged packages are
skipped. This is what powers Netlify's `turbo-ignore` and CI's affected-only runs.

**Sharing `@hawary/shared` into each bundler** — the one real gotcha:

- **Vite (web):** works out of the box — `@hawary/shared` exports TS source and esbuild
  transpiles it. If deep imports misbehave, add the package to `optimizeDeps.include`.
- **Metro (Expo):** needs a monorepo-aware config, or it won't find the symlinked package.
  Add **`apps/mobile/metro.config.js`**:

  ```js
  const { getDefaultConfig } = require('expo/metro-config');
  const path = require('path');

  const projectRoot = __dirname;
  const monorepoRoot = path.resolve(projectRoot, '../..');

  const config = getDefaultConfig(projectRoot);
  config.watchFolders = [monorepoRoot];
  config.resolver.nodeModulesPaths = [
    path.resolve(projectRoot, 'node_modules'),
    path.resolve(monorepoRoot, 'node_modules'),
  ];
  module.exports = config;
  ```

**Versioning** — the apps aren't published, so no Changesets needed. If `@hawary/shared`
ever ships to npm, add Changesets then. App versions live in `apps/web/package.json` and
`app.json` (mobile), bumped on release.

---

## Secrets & config summary

| Where | Secret | Used for |
|-------|--------|----------|
| Netlify env | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | web runtime |
| GitHub secrets | `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` | migration deploy |
| GitHub secrets | `EXPO_TOKEN` | EAS build/update/submit |
| EAS | Apple/Google signing creds | store builds (EAS-managed) |

The Supabase **service-role key** appears in **none** of the client pipelines — only in
Edge Functions / server env.

---

## Suggested rollout order

1. **Repo hygiene** — add `netlify.toml`, `apps/mobile/metro.config.js`, `.github/workflows/
   ci.yml`; enable branch protection on `main`.
2. **Web live** — connect Netlify to the repo, set env vars, verify a preview + prod deploy.
3. **DB automation** — add the migrate workflow + Supabase secrets.
4. **Mobile foundation** — `eas init`, fix `app.json` identifiers, set up channels, wire the
   preview-update workflow. Store submission comes when there's something to ship.
5. **Speed** — turn on Turborepo remote caching once CI feels slow.
```

> Most of step 1 is quick config I can scaffold on request — this doc is the plan, not the
> implementation.
