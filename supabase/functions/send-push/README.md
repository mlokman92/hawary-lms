# send-push

Delivers `notifications` rows to phones through Expo's push service. The design
and its reasons are in [docs/mobile-apps.md](../../../docs/mobile-apps.md) →
"Push"; this file is how to operate it.

## How it is called

Not by a client. The `notifications_dispatch_push` trigger posts the ids of
newly inserted rows through `pg_net`, with a bearer token held in Vault
(`push_dispatch`). The function reads the same secret through
`push_dispatch_secret()` — service role only — and refuses anything else.

Deployed with **`verify_jwt = false`** for that reason: the caller is Postgres,
which has no JWT. The body is `{ "ids": ["<notification uuid>", …] }`.

## Secrets

| name | needed | what |
| --- | --- | --- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | auto-injected | — |
| `EXPO_ACCESS_TOKEN` | only if "Enhanced security for push notifications" is on for the Expo account | sent as a bearer to Expo |

## Is it working

```sql
-- Phones registered, by app.
select app, platform, lang, count(*) from push_devices group by 1, 2, 3;

-- What pg_net sent recently, and what came back.
select id, status_code, content::text, created
from net._http_response
order by created desc
limit 20;
```

A `200` with `{"ok":true,"sent":N,"pruned":M}` is a delivery. `sent: 0` with no
error means nobody addressed had a phone registered for the right app, which is
the ordinary case while the apps are not yet installed.

`pruned` counts tokens Expo reported as `DeviceNotRegistered` — the app was
uninstalled — and the function deleted. That is the only cleanup the table
needs.

## Send one by hand

Re-deliver an existing notification (nothing is written; the row is only read):

```sql
select net.http_post(
  url := 'https://vpklztxqkvqmmzsxfqgp.supabase.co/functions/v1/send-push',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || (select decrypted_secret
                                     from vault.decrypted_secrets
                                    where name = 'push_dispatch')),
  body := jsonb_build_object('ids', jsonb_build_array('<notification id>'))
);
```

## Switching it off

The bell does not depend on this function, so it can be stopped without losing
anything:

```sql
alter table public.notifications disable trigger notifications_dispatch_push;
-- and back on:
alter table public.notifications enable trigger notifications_dispatch_push;
```

## Adding a notification kind

Add a `case` to `compose()` with a title and body in **both** languages. An
unknown kind is skipped, never pushed as a blank — so forgetting this step
costs the push, not the notification. Keep the wording in step with the
`notifications` namespace in `packages/shared/src/i18n`.
