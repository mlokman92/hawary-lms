# One owner: Hawary Academy

> Decided 2026-10-04. Supersedes the self-serve half of
> [academy-registration.md](academy-registration.md).

## The decision

Hawary LMS is **Hawary Academy's own system**, not a multi-tenant SaaS that
anyone can open an academy on. Hawary Academy is academy
`9c5fd727-65cd-4657-ab4d-fe52fa93d8b7`.

`academy_id` and every per-academy RLS policy **stay**. Hawary may open
**branches**, and a branch is an academy row: its own members, students,
courses, invoices and payment-gateway settings, isolated from the other
branches exactly as tenants were. Nothing about tenancy *inside* the database
changed. What changed is who can create and destroy an academy.

| | before | now |
| --- | --- | --- |
| create an academy | any signed-in account, via `/onboarding?new=1` or straight to PostgREST | the owner, in SQL / with the service role |
| delete an academy | any admin of it, via PostgREST | the owner, in SQL |
| edit an academy's profile | its admins | its Directors, letterhead columns only (see below) |

## Why

- **Self-serve founding only ever produced accidents.** People who came to
  *join* Hawary kept founding empty academies called "Hawary" — fifteen in nine
  days at one point — and every one needed a manual repair. The button had
  already been replaced with a WhatsApp link, but the INSERT policy still let
  any JWT found an academy through the API. A hidden button is not a boundary.
- **Deleting an academy cascades through the money.** `academies` is the root
  of an `ON DELETE CASCADE` tree that holds students, invoices and the payment
  ledger. "Admins can delete" meant one PostgREST call could erase a branch's
  financial history. Closing a branch is an owner decision, not a settings
  action.
- **Branches are why `academy_id` was not dropped.** Removing it would have
  meant rewriting every policy, RPC and Edge Function on a live system with real
  payments, only to put it back when the second branch opens.

## What was done

**Database** — migration `20261004090000_single_owner.sql`:

- dropped `academies: authenticated can create` and `academies: admins can delete`;
- revoked `insert, delete` on `academies` from `anon, authenticated`.

`app.handle_new_academy` stays. When the owner inserts a branch with
`created_by` set, that account becomes its first admin and its first Director
(`20261004110000_director_flag_follows_role`).

**Data, one-off (2026-10-04)** — deleted the three academies that were not
Hawary: *Cemerlang Academy v2* (test data: 5 students, 7 invoices, 5 payments),
*FFF* (one course) and *TASKA HAWARY* (empty). Their 10 storage objects went
through the Storage API. Hawary's counts were checked before and after and did
not change.

**Web**:

- `/onboarding` no longer has a founder form, a `?new=1` door or a "running your
  own academy?" prompt. It shows pending invitations, or *no record of you at
  this address* with a sign-out-and-switch button.
- The staff switcher lost "Add academy" and, like the learner one, renders as a
  plain label when the member belongs to one branch. With more than one it
  is a menu headed **Branches / Cawangan**.
- `lib/slug.ts` and the founder-form i18n keys are gone.

## Directors

Migration `20261004100000_director_grants_staff.sql`.

A **Director** is an admin whose `academy_members.is_director` is true. Hawary
Academy has two: Madam Linda (academyhawary@gmail.com, who created the academy
row) and Lokman (muhamadlokman92@gmail.com). Only the owner sets the flag, in
SQL; `app.guard_member_director` refuses to grant it from a JWT, Directors
included. `app.is_director(academy_id)` also requires an **active admin**
membership. Suspending a Director pauses the power, and restoring them brings
it back. **Demoting** a Director (their role leaving admin) clears the flag for
good, so making them an admin again from the app does not make them a Director
again; re-appointing one is the owner's SQL (`20261004110000`).

Only a Director can:

- **grant or revoke staff access.** That means changing anyone's role to or
  from admin/trainer; suspending, restoring or removing an admin or trainer
  membership; creating or deleting instructor records; linking, unlinking or
  inviting an instructor account; changing an unlinked instructor's email; and
  archiving or restoring an instructor.
- **change gateway and billing settings.** That covers
  `academy_payment_settings` (incl. part-payment defaults), ToyyibPay and Billplz
  credentials, and the academy's letterhead on `academies` (column-granted: name,
  registration, contact, address, SST, logo — never `slug`, `created_by`,
  `status`, `timezone` or `currency`).

Every other admin power is unchanged: students, courses, invoices, payments,
pay links, incentives, appointments, reports. Admins still *read* the settings.

**Why the instructor record is gated, not just the membership.** An unlinked
instructor record with an email is claimable: whoever signs in with that
address gets a trainer membership through `link_claimed_record`. So creating
such a record, changing its email, or un-archiving it *is* a grant.
Before this migration, any trainer could do all three (`instructors` INSERT was
`is_staff`). `app.guard_instructor_grant` refuses those columns to a
non-Director, but lets two SECURITY DEFINER paths through: a claim (an unlinked
record becoming the caller's own) and the release of the caller's own archived
record (see below).

**Why removal is gated too.** "Only a Director adds staff" means nothing if any
admin can suspend the Director's trainers or demote a fellow admin.

## An archived record releases its login

Migration `20261004100100_archived_record_releases_login.sql`. A login backs at
most one student and one instructor record per academy. Archiving a record used
to leave the login stuck on it, which broke three things:

- `/learn` said "not linked";
- the replacement record never appeared in pending invitations;
- the replacement's emailed link failed the unique constraint.

`link_claimed_record` now frees the caller's **archived** records in that
academy before linking the new one. History stays on the archived record, keyed
by `student_id`. A live record still blocks a second claim.

## Opening a branch

There is no UI for this, on purpose, until a second branch actually exists and
the owner says how branches should relate (shared courses? one Director over
all of them? consolidated money screens?). Until then:

```sql
insert into public.academies (name, slug, created_by, phone, state)
values ('Hawary Academy <Branch>', 'hawary-<branch>', '<owner user id>', …);
-- handle_new_academy makes created_by its admin and Director.

-- A further Director for the branch (an existing admin member):
update public.academy_members set is_director = true
where academy_id = '<branch id>' and user_id = '<user id>' and role = 'admin';
```

Then configure its payment settings and invoice details from `/settings` as
that Director. Each branch has its own public join link, `/enroll/<slug>`.
