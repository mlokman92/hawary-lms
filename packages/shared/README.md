# @hawary/shared

Code shared by both `apps/web` and `apps/mobile`. **Shared-first**: if both apps
need it, it belongs here — do not duplicate.

## Planned contents

```
packages/shared/src/
├── db/            # generated Supabase types (do not hand-edit) + query helpers
├── supabase/      # Supabase client factory (anon/publishable key) for each platform
├── domain/        # business logic: enrollment, grading, invoicing, money (sen)
├── validation/    # schema validation (e.g. zod) for forms & API payloads
└── index.ts       # public exports
```

## Notes

- **Database types are generated** via the Supabase MCP `generate_typescript_types`
  and committed here. Regenerate after every schema change.
- Keep money as integer **sen** to avoid floating-point errors; format to `RM` at
  the UI edge only.
- No secrets here — client apps use the anon/publishable key + RLS; privileged
  operations belong in Supabase Edge Functions.
