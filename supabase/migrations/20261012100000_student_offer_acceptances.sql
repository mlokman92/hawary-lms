-- ============================================================================
-- Offer letter acceptance: a student signs, and agrees to the terms.
--
-- The letter the academy issues ends with a declaration the student accepts
-- (see docs/documents.md). What the academy needs to keep is who accepted, when,
-- and the signature they drew — so staff can see it and the letter can carry it.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. One acceptance per student.
--
--    `student_id` is the primary key: signing again replaces. A table of its own
--    rather than columns on `students`, for the reason `student_ic_copies` is
--    one — who may read a signature is a policy on the signature, not a
--    carve-out from the student record, which a trainer reads.
--
--    The signature is the PNG the browser drew, kept as a data URL. It is a few
--    kilobytes of ink, so a private bucket and an Edge Function would be more
--    machinery than the thing deserves; the shape check below is what keeps the
--    column from becoming a place to put anything else.
--
--    Clients never write it: `sign_offer_letter` does, for the caller's own
--    student record, and copies `academy_id` from that record.
-- ---------------------------------------------------------------------------
create table if not exists public.student_offer_acceptances (
  student_id  uuid primary key references public.students(id) on delete cascade,
  academy_id  uuid not null references public.academies(id) on delete cascade,
  signature   text not null
    check (
      signature like 'data:image/png;base64,iVBORw0KGgo%'
      and char_length(signature) <= 300000
    ),
  accepted_at timestamptz not null default now()
);

comment on table public.student_offer_acceptances is
  'A student''s signature and agreement to the offer letter terms, one per student. Clients have no DML: sign_offer_letter.';

create index if not exists student_offer_acceptances_academy_idx
  on public.student_offer_acceptances (academy_id);

alter table public.student_offer_acceptances enable row level security;

-- Admins, and the student who signed. Not `app.is_staff`: see above.
create policy "offer acceptances: admin or own read"
  on public.student_offer_acceptances for select to authenticated
  using (app.is_admin(academy_id) or app.owns_student(student_id));

revoke all on public.student_offer_acceptances from anon, authenticated;
grant select on public.student_offer_acceptances to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Signing.
--
--    The caller must be the account the student record is linked to, as in
--    update_my_student_details. Staff do not sign for a student. Returns the
--    moment recorded, which the page shows and the letter prints.
-- ---------------------------------------------------------------------------
create or replace function public.sign_offer_letter(
  _student_id uuid,
  _signature  text
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  _uid     uuid := (select auth.uid());
  _academy uuid;
  _at      timestamptz;
begin
  if _uid is null then raise exception 'You must be signed in'; end if;

  if _signature is null
     or _signature not like 'data:image/png;base64,iVBORw0KGgo%' then
    raise exception 'The signature is not a PNG image';
  end if;
  if char_length(_signature) > 300000 then
    raise exception 'The signature is too large';
  end if;

  select s.academy_id into _academy
    from public.students s
   where s.id = _student_id
     and s.user_id = _uid
     and s.archived_at is null;
  if not found then raise exception 'Student record not found'; end if;

  insert into public.student_offer_acceptances as a
         (student_id, academy_id, signature, accepted_at)
  values (_student_id, _academy, _signature, now())
  on conflict (student_id) do update
     set signature   = excluded.signature,
         accepted_at = excluded.accepted_at
  returning a.accepted_at into _at;

  return _at;
end;
$$;

revoke execute on function public.sign_offer_letter(uuid, text) from public, anon;
grant  execute on function public.sign_offer_letter(uuid, text) to authenticated;
